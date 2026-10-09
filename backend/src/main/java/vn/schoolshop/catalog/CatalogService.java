package vn.schoolshop.catalog;

import static vn.schoolshop.catalog.CatalogDtos.*;
import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.*;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.infrastructure.Asset;
import vn.schoolshop.inventory.Inventory;
import vn.schoolshop.shop.*;

@Service
public class CatalogService {
  private final DomainRepository db;
  private final ShopAccess shop;
  private final ProfileService profiles;
  private final AuditService audit;
  private final vn.schoolshop.infrastructure.StoragePort storage;

  public CatalogService(
      DomainRepository db,
      ShopAccess shop,
      ProfileService profiles,
      AuditService audit,
      vn.schoolshop.infrastructure.StoragePort storage) {
    this.db = db;
    this.shop = shop;
    this.profiles = profiles;
    this.audit = audit;
    this.storage = storage;
  }

  public Product product(UUID id, boolean publicOnly) {
    var p = db.find(Product.class, id);
    shop.same(p.shopId);
    if (publicOnly && !p.status.equals("ACTIVE")) throw ApiException.missing();
    return p;
  }

  public Combo combo(UUID id, boolean publicOnly) {
    var c = db.find(Combo.class, id);
    shop.same(c.shopId);
    if (publicOnly && !c.status.equals("ACTIVE")) throw ApiException.missing();
    return c;
  }

  public List<ComboItem> components(UUID id) {
    return db.list(ComboItem.class, "e.comboId=:id", Map.of("id", id));
  }

  public void asset(UUID id, String type) {
    if (id == null) return;
    var a = db.find(Asset.class, id);
    shop.same(a.shopId);
    check(type.equals(a.type), 400, "INVALID_ASSET", "Loại ảnh không phù hợp.");
  }

  @Transactional(readOnly = true)
  public Object categories() {
    return db
        .list(Category.class, "e.shopId=:shop and e.active=true", Map.of("shop", shop.id))
        .stream()
        .map(c -> map("id", c.id, "code", c.code, "name", c.name, "active", c.active))
        .toList();
  }

  @Transactional(readOnly = true)
  public Object list(
      boolean combos,
      boolean seller,
      String q,
      String category,
      String sort,
      int page,
      int requestedSize,
      Actor actor) {
    if (seller) profiles.seller(actor);
    int size = size(requestedSize);
    check(page >= 0 && page <= 100000, 400, "INVALID_PAGE", "Trang không hợp lệ.");
    String predicate = "e.shopId=:shop" + (seller ? "" : " and e.status='ACTIVE'");
    var params = new HashMap<String, Object>();
    params.put("shop", shop.id);
    if (q != null && !q.isBlank()) {
      predicate += " and lower(e.name) like :q";
      params.put("q", "%" + q.toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%");
    }
    if (!combos && category != null && !category.isBlank()) {
      predicate +=
          " and e.categoryId in (select c.id from Category c where c.shopId=:shop and (c.code=:category or cast(c.id as string)=:category))";
      params.put("category", category);
    }
    String order =
        switch (sort == null ? "newest" : sort) {
          case "price_asc" -> "e.price asc,e.id asc";
          case "price_desc" -> "e.price desc,e.id asc";
          case "newest" -> "e.createdAt desc,e.id asc";
          default -> throw new ApiException(400, "INVALID_SORT", "Sắp xếp không hợp lệ.");
        };
    Class<?> type = combos ? Combo.class : Product.class;
    List<?> rows = db.page(type, predicate, params, page, size, order);
    prefetch(rows, combos);
    var grouped = new HashMap<UUID, List<ComboItem>>();
    if (combos && !rows.isEmpty())
      for (var part :
          db.list(
              ComboItem.class,
              "e.comboId in :ids",
              Map.of("ids", rows.stream().map(x -> ((Combo) x).id).toList())))
        grouped.computeIfAbsent(part.comboId, k -> new ArrayList<>()).add(part);
    return map(
        "content",
        rows.stream()
            .map(
                x ->
                    x instanceof Product p
                        ? productView(p, seller)
                        : comboView(
                            (Combo) x, seller, grouped.getOrDefault(((Combo) x).id, List.of())))
            .toList(),
        "page",
        page,
        "size",
        size,
        "totalElements",
        db.count(type, predicate, params),
        "totalPages",
        (db.count(type, predicate, params) + size - 1) / size);
  }

  @Transactional(readOnly = true)
  public Object detail(boolean combos, UUID id, boolean seller, Actor actor) {
    if (seller) profiles.seller(actor);
    return combos
        ? comboView(combo(id, !seller), seller)
        : productView(product(id, !seller), seller);
  }

  private void prefetch(List<?> rows, boolean combos) {
    if (rows.isEmpty()) return;
    var productIds = new HashSet<UUID>();
    var assetIds = new HashSet<UUID>();
    var categoryIds = new HashSet<UUID>();
    if (combos) {
      var ids = rows.stream().map(x -> ((Combo) x).id).toList();
      var parts = db.list(ComboItem.class, "e.comboId in :ids", Map.of("ids", ids));
      for (var item : parts) productIds.add(item.productId);
      for (var row : rows) {
        var c = (Combo) row;
        if (c.imageAssetId != null) assetIds.add(c.imageAssetId);
      }
    } else for (var row : rows) productIds.add(((Product) row).id);
    if (!productIds.isEmpty()) {
      var products = db.list(Product.class, "e.id in :ids", Map.of("ids", productIds));
      db.list(Inventory.class, "e.id in :ids", Map.of("ids", productIds));
      for (var product : products) {
        categoryIds.add(product.categoryId);
        if (product.imageAssetId != null) assetIds.add(product.imageAssetId);
      }
    }
    if (!categoryIds.isEmpty()) db.list(Category.class, "e.id in :ids", Map.of("ids", categoryIds));
    if (!assetIds.isEmpty()) db.list(Asset.class, "e.id in :ids", Map.of("ids", assetIds));
  }

  public Map<String, Object> productView(Product p, boolean seller) {
    var i = db.find(Inventory.class, p.id);
    var out =
        map(
            "id",
            p.id,
            "kind",
            "PRODUCT",
            "slug",
            p.slug,
            "name",
            p.name,
            "categoryId",
            p.categoryId,
            "description",
            p.description,
            "price",
            p.price,
            "imageAssetId",
            p.imageAssetId,
            "ingredients",
            p.ingredients,
            "storageInstructions",
            p.storageInstructions,
            "preservationInstructions",
            p.storageInstructions,
            "allergens",
            p.allergens,
            "categoryName",
            db.find(Category.class, p.categoryId).name,
            "imageUrl",
            imageUrl(p.imageAssetId),
            "isSoldOut",
            i.stockOnHand == i.stockReserved,
            "status",
            p.status,
            "availableStock",
            i.stockOnHand - i.stockReserved,
            "soldOut",
            i.stockOnHand == i.stockReserved,
            "version",
            p.version,
            "image",
            image(p.imageAssetId));
    if (seller)
      out.putAll(
          map(
              "status",
              p.status,
              "stockOnHand",
              i.stockOnHand,
              "stockReserved",
              i.stockReserved,
              "inventoryVersion",
              i.version));
    return out;
  }

  public Map<String, Object> image(UUID id) {
    if (id == null) return null;
    var a = db.find(Asset.class, id);
    return map(
        "assetId",
        a.id,
        "objectPath",
        a.objectPath,
        "thumbnailPath",
        a.thumbnailPath,
        "bucket",
        a.bucket);
  }

  public Map<String, Object> comboView(Combo c, boolean seller) {
    return comboView(c, seller, components(c.id));
  }

  private Map<String, Object> comboView(Combo c, boolean seller, List<ComboItem> parts) {
    int available = Integer.MAX_VALUE;
    BigDecimal retail = BigDecimal.ZERO;
    var items = new ArrayList<Object>();
    for (var item : parts) {
      var p = product(item.productId, false);
      var i = db.find(Inventory.class, p.id);
      available =
          Math.min(
              available,
              p.status.equals("ACTIVE") ? (i.stockOnHand - i.stockReserved) / item.quantity : 0);
      retail = retail.add(p.price.multiply(BigDecimal.valueOf(item.quantity)));
      items.add(
          map(
              "productId",
              p.id,
              "name",
              p.name,
              "quantity",
              item.quantity,
              "productName",
              p.name,
              "availableStock",
              i.stockOnHand - i.stockReserved));
    }
    if (items.isEmpty()) available = 0;
    var out =
        map(
            "id",
            c.id,
            "kind",
            "COMBO",
            "slug",
            c.slug,
            "name",
            c.name,
            "description",
            c.description,
            "price",
            c.price,
            "imageAssetId",
            c.imageAssetId,
            "image",
            image(c.imageAssetId),
            "imageUrl",
            imageUrl(c.imageAssetId),
            "isSoldOut",
            available == 0,
            "status",
            c.status,
            "items",
            items,
            "availableStock",
            available,
            "soldOut",
            available == 0,
            "retailTotal",
            retail,
            "savings",
            retail.subtract(c.price).max(BigDecimal.ZERO),
            "version",
            c.version);
    if (seller) out.putAll(map("status", c.status, "priceWarning", c.price.compareTo(retail) > 0));
    return out;
  }

  public String imageUrl(UUID id) {
    if (id == null) return null;
    var a = db.find(Asset.class, id);
    return storage.publicUrl(a.bucket, a.objectPath);
  }

  public String slug(String name, UUID id) {
    String result =
        java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replace('đ', 'd')
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-|-$", "");
    if (result.isBlank()) result = "item";
    return result + "-" + id.toString().substring(0, 8);
  }

  @Transactional(readOnly = true)
  public Object publicDetail(boolean combos, String id) {
    try {
      return detail(combos, UUID.fromString(id), false, null);
    } catch (IllegalArgumentException e) {
      var params = Map.of("shop", shop.id, "slug", id);
      if (combos) {
        var rows =
            db.list(Combo.class, "e.shopId=:shop and e.slug=:slug and e.status='ACTIVE'", params);
        if (rows.isEmpty()) throw ApiException.missing();
        return comboView(rows.getFirst(), false);
      }
      var rows =
          db.list(Product.class, "e.shopId=:shop and e.slug=:slug and e.status='ACTIVE'", params);
      if (rows.isEmpty()) throw ApiException.missing();
      return productView(rows.getFirst(), false);
    }
  }

  @Transactional
  public Object saveProduct(Actor actor, UUID id, ProductInput input) {
    profiles.seller(actor);
    shop.lock();
    boolean create = id == null;
    var p = create ? new Product() : product(id, false);
    if (create) {
      check(
          input.name() != null
              && !input.name().isBlank()
              && input.categoryId() != null
              && input.price() != null,
          400,
          "REQUIRED_FIELDS",
          "Cần tên, danh mục và giá.");
      p.status = "DRAFT";
      p.shopId = shop.id;
    } else {
      check(input.expectedVersion() != null, 400, "VERSION_REQUIRED", "Cần expectedVersion.");
      ApiException.version(p.version, input.expectedVersion());
      check(
          input.initialStock() == null,
          400,
          "STOCK_ACTION_REQUIRED",
          "Dùng stock-adjustments để sửa tồn kho.");
    }
    if (input.categoryId() != null) {
      var category = db.find(Category.class, input.categoryId());
      shop.same(category.shopId);
      check(category.active, 400, "INVALID_CATEGORY", "Danh mục không hoạt động.");
      p.categoryId = input.categoryId();
    }
    if (input.imageAssetId() != null) {
      asset(input.imageAssetId(), "PRODUCT_IMAGE");
      p.imageAssetId = input.imageAssetId();
    }
    String before = create ? null : "{\"price\":" + p.price + "}";
    if (input.name() != null) {
      check(!input.name().isBlank(), 400, "INVALID_NAME", "Tên không được trống.");
      p.name = input.name().trim();
    }
    if (input.slug() != null) p.slug = input.slug();
    else if (create) p.slug = slug(p.name, p.id);
    if (input.description() != null) p.description = input.description();
    if (input.price() != null) p.price = input.price();
    if (input.ingredients() != null) p.ingredients = input.ingredients();
    if (input.allergens() != null) p.allergens = input.allergens();
    if (input.storageInstructions() != null) p.storageInstructions = input.storageInstructions();
    if (create) {
      db.add(p);
      var i = new Inventory();
      i.id = p.id;
      i.stockOnHand = input.initialStock() == null ? 0 : input.initialStock();
      db.add(i);
    }
    // Mark aggregate dirty even when only its children/metadata change.
    p.updatedAt = java.time.Instant.now();
    audit.record(
        actor,
        create ? "PRODUCT_CREATED" : "PRODUCT_UPDATED",
        "PRODUCT",
        p.id,
        before,
        "{\"price\":" + p.price + "}");
    db.flush();
    return productView(p, true);
  }

  @Transactional
  public Object saveCombo(Actor actor, UUID id, ComboInput input) {
    profiles.seller(actor);
    shop.lock();
    boolean create = id == null;
    var c = create ? new Combo() : combo(id, false);
    if (create) {
      check(
          input.name() != null
              && !input.name().isBlank()
              && input.price() != null
              && input.items() != null,
          400,
          "REQUIRED_FIELDS",
          "Cần tên, giá và thành phần combo.");
      c.status = "DRAFT";
      c.shopId = shop.id;
    } else {
      check(input.expectedVersion() != null, 400, "VERSION_REQUIRED", "Cần expectedVersion.");
      ApiException.version(c.version, input.expectedVersion());
    }
    if (input.imageAssetId() != null) {
      asset(input.imageAssetId(), "PRODUCT_IMAGE");
      c.imageAssetId = input.imageAssetId();
    }
    if (input.name() != null) {
      check(!input.name().isBlank(), 400, "INVALID_NAME", "Tên không được trống.");
      c.name = input.name().trim();
    }
    if (input.slug() != null) c.slug = input.slug();
    else if (create) c.slug = slug(c.name, c.id);
    if (input.description() != null) c.description = input.description();
    if (input.price() != null) c.price = input.price();
    var parts =
        input.items() == null
            ? components(c.id).stream().map(x -> new Component(x.productId, x.quantity)).toList()
            : input.items();
    check(parts.size() >= 2, 400, "INVALID_COMBO", "Combo cần ít nhất hai món.");
    var seen = new HashSet<UUID>();
    BigDecimal retail = BigDecimal.ZERO;
    for (var part : parts) {
      check(seen.add(part.productId()), 400, "DUPLICATE_COMPONENT", "Thành phần combo bị trùng.");
      var p = product(part.productId(), true);
      retail = retail.add(p.price.multiply(BigDecimal.valueOf(part.quantity())));
    }
    check(
        c.price.compareTo(retail) <= 0,
        400,
        "INVALID_COMBO_PRICE",
        "Giá combo không được vượt tổng giá lẻ.");
    if (create) db.add(c);
    else if (input.items() != null) {
      for (var part : components(c.id)) db.remove(part);
      db.flush();
    }
    if (create || input.items() != null)
      for (var part : parts) {
        var item = new ComboItem();
        item.comboId = c.id;
        item.productId = part.productId();
        item.quantity = part.quantity();
        db.add(item);
      }
    c.updatedAt = java.time.Instant.now();
    audit.record(
        actor,
        create ? "COMBO_CREATED" : "COMBO_UPDATED",
        "COMBO",
        c.id,
        null,
        "{\"price\":" + c.price + "}");
    db.flush();
    return comboView(c, true);
  }

  @Transactional
  public Object status(Actor actor, boolean combos, UUID id, String status, long expected) {
    profiles.seller(actor);
    shop.lock();
    if (combos) {
      var c = combo(id, false);
      ApiException.version(c.version, expected);
      if (status.equals("ACTIVE")) {
        check(c.imageAssetId != null, 400, "IMAGE_REQUIRED", "Cần ảnh trước khi mở bán.");
        var parts = components(id);
        check(parts.size() >= 2, 400, "INVALID_COMBO", "Combo cần ít nhất hai món.");
        for (var part : parts) product(part.productId, true);
      }
      c.status = status;
      audit.record(
          actor,
          "COMBO_" + (status.equals("ACTIVE") ? "ACTIVATED" : "ARCHIVED"),
          "COMBO",
          id,
          null,
          "{\"status\":\"" + status + "\"}");
      db.flush();
      return comboView(c, true);
    }
    var p = product(id, false);
    ApiException.version(p.version, expected);
    if (status.equals("ACTIVE"))
      check(p.imageAssetId != null, 400, "IMAGE_REQUIRED", "Cần ảnh trước khi mở bán.");
    p.status = status;
    audit.record(
        actor,
        "PRODUCT_" + (status.equals("ACTIVE") ? "ACTIVATED" : "ARCHIVED"),
        "PRODUCT",
        id,
        null,
        "{\"status\":\"" + status + "\"}");
    db.flush();
    return productView(p, true);
  }
}
