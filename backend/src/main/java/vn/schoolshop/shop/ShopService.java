package vn.schoolshop.shop;

import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.catalog.CatalogService;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;

@Service
public class ShopService {
  private final ShopAccess shop;
  private final DomainRepository db;
  private final ProfileService profiles;
  private final CatalogService catalog;
  private final AuditService audit;

  public ShopService(
      ShopAccess shop,
      DomainRepository db,
      ProfileService profiles,
      CatalogService catalog,
      AuditService audit) {
    this.shop = shop;
    this.db = db;
    this.profiles = profiles;
    this.catalog = catalog;
    this.audit = audit;
  }

  public PickupPoint pickup(UUID id) {
    var p = db.find(PickupPoint.class, id);
    shop.same(p.shopId);
    check(p.active, 400, "INVALID_PICKUP_POINT", "Điểm nhận không hoạt động.");
    return p;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(boolean seller, Actor actor) {
    if (seller) profiles.seller(actor);
    var s = shop.get();
    var out =
        map(
            "id",
            s.id,
            "name",
            s.name,
            "contactPhone",
            s.contactPhone,
            "contactEmail",
            s.contactEmail,
            "acceptingOrders",
            s.acceptingOrders,
            "version",
            s.version,
            "pickupPoints",
            points(seller));
    if (seller) {
      out.put("paymentSettingsVersionId", s.paymentSettingsVersionId);
      if (s.paymentSettingsVersionId != null) {
        var b = db.find(PaymentSettings.class, s.paymentSettingsVersionId);
        out.put(
            "bank",
            map(
                "bankName",
                b.bankName,
                "accountNumber",
                b.accountNumber,
                "accountHolder",
                b.accountHolder,
                "qrAssetId",
                b.qrAssetId,
                "versionId",
                b.id));
        out.putAll(
            map(
                "bankName",
                b.bankName,
                "accountNumber",
                b.accountNumber,
                "accountHolder",
                b.accountHolder,
                "qrAssetId",
                b.qrAssetId));
      }
    }
    return out;
  }

  public List<Map<String, Object>> points(boolean seller) {
    return db
        .list(
            PickupPoint.class,
            "e.shopId=:shop" + (seller ? "" : " and e.active=true"),
            Map.of("shop", shop.id))
        .stream()
        .map(
            p ->
                map(
                    "id",
                    p.id,
                    "name",
                    p.name,
                    "instructions",
                    p.instructions,
                    "active",
                    p.active,
                    "version",
                    p.version))
        .toList();
  }

  @Transactional
  public Object update(Actor actor, SettingsInput input) {
    profiles.seller(actor);
    var s = shop.lock();
    ApiException.version(s.version, input.expectedVersion());
    if (input.name() != null) {
      check(!input.name().isBlank(), 400, "INVALID_NAME", "Tên shop không được trống.");
      s.name = input.name().trim();
    }
    if (input.contactPhone() != null) s.contactPhone = input.contactPhone();
    if (input.contactEmail() != null) s.contactEmail = input.contactEmail();
    if (input.acceptingOrders() != null) s.acceptingOrders = input.acceptingOrders();
    boolean flat =
        input.bankName() != null
            || input.accountNumber() != null
            || input.accountHolder() != null
            || input.qrAssetId() != null;
    check(
        !flat || input.bank() == null,
        400,
        "INVALID_BANK_INPUT",
        "Chỉ dùng một định dạng ngân hàng.");
    BankInput b = input.bank();
    if (flat) {
      PaymentSettings old =
          s.paymentSettingsVersionId == null
              ? null
              : db.find(PaymentSettings.class, s.paymentSettingsVersionId);
      b =
          new BankInput(
              input.bankName() != null ? input.bankName() : old == null ? null : old.bankName,
              input.accountNumber() != null
                  ? input.accountNumber()
                  : old == null ? null : old.accountNumber,
              input.accountHolder() != null
                  ? input.accountHolder()
                  : old == null ? null : old.accountHolder,
              input.qrAssetId() != null ? input.qrAssetId() : old == null ? null : old.qrAssetId);
    }
    if (b != null) {
      check(
          b.bankName() != null
              && !b.bankName().isBlank()
              && b.accountNumber() != null
              && !b.accountNumber().isBlank()
              && b.accountHolder() != null
              && !b.accountHolder().isBlank()
              && b.qrAssetId() != null,
          400,
          "BANK_FIELDS_REQUIRED",
          "Cần đầy đủ ngân hàng, số tài khoản, chủ tài khoản và QR.");
      catalog.asset(b.qrAssetId(), "PAYMENT_QR");
      var payment = new PaymentSettings();
      payment.shopId = shop.id;
      payment.bankName = b.bankName().trim();
      payment.accountNumber = b.accountNumber().trim();
      payment.accountHolder = b.accountHolder().trim();
      payment.qrAssetId = b.qrAssetId();
      payment.createdBy = actor.id();
      db.add(payment);
      s.paymentSettingsVersionId = payment.id;
      audit.record(
          actor, "PAYMENT_SETTINGS_VERSION_CREATED", "PAYMENT_SETTINGS", payment.id, null, null);
    }
    audit.record(
        actor,
        "SHOP_SETTINGS_UPDATED",
        "SHOP",
        s.id,
        null,
        "{\"acceptingOrders\":" + s.acceptingOrders + "}");
    db.flush();
    return get(true, actor);
  }

  @Transactional
  public Object savePoint(Actor actor, UUID id, PointInput input) {
    profiles.seller(actor);
    shop.lock();
    var p = id == null ? new PickupPoint() : db.find(PickupPoint.class, id);
    if (id != null) {
      shop.same(p.shopId);
      check(input.expectedVersion() != null, 400, "VERSION_REQUIRED", "Cần expectedVersion.");
      ApiException.version(p.version, input.expectedVersion());
    } else
      check(
          input.name() != null && !input.name().isBlank(),
          400,
          "NAME_REQUIRED",
          "Cần tên điểm nhận.");
    p.shopId = shop.id;
    if (input.name() != null) {
      check(!input.name().isBlank(), 400, "INVALID_NAME", "Tên không được trống.");
      p.name = input.name().trim();
    }
    if (input.instructions() != null) p.instructions = input.instructions();
    if (input.active() != null) p.active = input.active();
    else if (id == null) p.active = true;
    if (id == null) db.add(p);
    audit.record(
        actor, "PICKUP_POINT_CHANGED", "PICKUP_POINT", p.id, null, "{\"active\":" + p.active + "}");
    db.flush();
    return map(
        "id",
        p.id,
        "name",
        p.name,
        "instructions",
        p.instructions,
        "active",
        p.active,
        "version",
        p.version);
  }

  public record BankInput(
      @NotBlank @Size(max = 100) String bankName,
      @NotBlank @Size(max = 100) String accountNumber,
      @NotBlank @Size(max = 100) String accountHolder,
      @NotNull UUID qrAssetId) {}

  public record SettingsInput(
      @Size(min = 2, max = 100) String name,
      @Size(max = 30) String contactPhone,
      @Email @Size(max = 254) String contactEmail,
      Boolean acceptingOrders,
      @Valid BankInput bank,
      @Size(max = 100) String bankName,
      @Size(max = 100) String accountNumber,
      @Size(max = 100) String accountHolder,
      UUID qrAssetId,
      @NotNull @PositiveOrZero Long expectedVersion) {}

  public record PointInput(
      @Size(min = 2, max = 100) String name,
      @Size(max = 500) String instructions,
      Boolean active,
      @PositiveOrZero Long expectedVersion) {}
}
