package vn.schoolshop.inventory;

import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.map;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.catalog.*;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.infrastructure.IdempotencyService;
import vn.schoolshop.shop.ShopAccess;

@Service
public class InventoryService {
  private final DomainRepository db;
  private final ShopAccess shop;
  private final ProfileService profiles;
  private final AuditService audit;
  private final IdempotencyService idem;
  private final CatalogService catalog;

  public InventoryService(
      DomainRepository db,
      ShopAccess shop,
      ProfileService profiles,
      AuditService audit,
      IdempotencyService idem,
      CatalogService catalog) {
    this.db = db;
    this.shop = shop;
    this.profiles = profiles;
    this.audit = audit;
    this.idem = idem;
    this.catalog = catalog;
  }

  public void reserve(UUID order, Map<UUID, Integer> demand, Actor actor) {
    for (var entry : new TreeMap<>(demand).entrySet()) {
      var i = db.lock(Inventory.class, entry.getKey());
      int qty = entry.getValue();
      if (i.stockOnHand - i.stockReserved < qty)
        throw new ApiException(
            409,
            "INSUFFICIENT_STOCK",
            "Một số món không còn đủ số lượng.",
            List.of(
                map(
                    "field",
                    "items",
                    "catalogId",
                    i.id,
                    "availableQuantity",
                    i.stockOnHand - i.stockReserved)));
      i.stockReserved += qty;
      var r = new Reservation();
      r.orderId = order;
      r.productId = i.id;
      r.quantity = qty;
      r.state = "HELD";
      db.add(r);
      movement(i.id, order, "RESERVED", 0, qty, null, actor);
      audit.record(actor, "STOCK_RESERVED", "PRODUCT", i.id, null, "{\"quantity\":" + qty + "}");
    }
  }

  public void settle(UUID order, boolean consume, Actor actor) {
    var held = db.list(Reservation.class, "e.orderId=:id and e.state='HELD'", Map.of("id", order));
    held.sort(Comparator.comparing(r -> r.productId));
    for (var r : held) {
      var i = db.lock(Inventory.class, r.productId);
      i.stockReserved -= r.quantity;
      if (consume) i.stockOnHand -= r.quantity;
      r.state = consume ? "CONSUMED" : "RELEASED";
      movement(i.id, order, r.state, consume ? -r.quantity : 0, -r.quantity, null, actor);
      audit.record(
          actor,
          consume ? "STOCK_CONSUMED" : "STOCK_RELEASED",
          "PRODUCT",
          i.id,
          null,
          "{\"quantity\":" + r.quantity + "}");
    }
  }

  @Transactional
  public Object adjust(Actor actor, UUID id, String key, CatalogDtos.StockInput input) {
    profiles.seller(actor);
    shop.lock();
    catalog.product(id, false);
    return idem.run(
        actor,
        "stock:" + id,
        key,
        input,
        () -> {
          var i = db.lock(Inventory.class, id);
          ApiException.version(i.version, input.expectedVersion());
          check(
              (input.stockOnHand() == null) != (input.deltaOnHand() == null),
              400,
              "INVALID_STOCK_INPUT",
              "Chọn stockOnHand hoặc deltaOnHand.");
          long target =
              input.stockOnHand() != null
                  ? input.stockOnHand()
                  : (long) i.stockOnHand + input.deltaOnHand();
          check(
              target >= 0 && target <= Integer.MAX_VALUE,
              400,
              "INVALID_STOCK",
              "Tồn kho vượt giới hạn.");
          check(
              target >= i.stockReserved,
              409,
              "RESERVED_STOCK_CONFLICT",
              "Tổng tồn không được thấp hơn lượng đang giữ.");
          int before = i.stockOnHand;
          i.stockOnHand = (int) target;
          movement(id, null, "ADJUSTED", i.stockOnHand - before, 0, input.reason(), actor);
          audit.record(
              actor,
              "STOCK_ADJUSTED",
              "PRODUCT",
              id,
              "{\"stockOnHand\":" + before + "}",
              "{\"stockOnHand\":" + i.stockOnHand + "}");
          db.flush();
          return map(
              "productId",
              id,
              "stockOnHand",
              i.stockOnHand,
              "stockReserved",
              i.stockReserved,
              "availableStock",
              i.stockOnHand - i.stockReserved,
              "version",
              i.version);
        });
  }

  private void movement(
      UUID product, UUID order, String kind, int onHand, int reserved, String reason, Actor actor) {
    var m = new Movement();
    m.productId = product;
    m.orderId = order;
    m.kind = kind;
    m.deltaOnHand = onHand;
    m.deltaReserved = reserved;
    m.reason = reason;
    m.actorId = actor.id();
    db.add(m);
  }
}
