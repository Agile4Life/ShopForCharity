package vn.schoolshop.order;

import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.*;
import static vn.schoolshop.order.CheckoutDtos.*;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.catalog.CatalogService;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.infrastructure.*;
import vn.schoolshop.inventory.InventoryService;
import vn.schoolshop.payment.PaymentEvent;
import vn.schoolshop.shop.*;

@Service
public class OrderService {
  private final DomainRepository db;
  private final ShopAccess shop;
  private final ShopService settings;
  private final ProfileService profiles;
  private final OrderAccess access;
  private final InventoryService inventory;
  private final IdempotencyService idem;
  private final AuditService audit;
  private final CatalogService catalog;
  private final Clock clock;

  public OrderService(
      DomainRepository db,
      ShopAccess shop,
      ShopService settings,
      ProfileService profiles,
      OrderAccess access,
      InventoryService inventory,
      IdempotencyService idem,
      AuditService audit,
      CatalogService catalog,
      Clock clock) {
    this.db = db;
    this.shop = shop;
    this.settings = settings;
    this.profiles = profiles;
    this.access = access;
    this.inventory = inventory;
    this.idem = idem;
    this.audit = audit;
    this.catalog = catalog;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public Object detail(Actor actor, UUID id, boolean seller) {
    if (seller) profiles.seller(actor);
    return view(access.owned(id, actor, seller), seller);
  }

  @Transactional(readOnly = true)
  public UUID guestId(Actor actor, String code) {
    return access.code(code, actor).id;
  }

  @Transactional(readOnly = true)
  public Object list(
      Actor actor,
      boolean seller,
      String status,
      String payment,
      String code,
      String date,
      int page,
      int requestedSize) {
    if (seller) profiles.seller(actor);
    check(page >= 0 && page <= 100000, 400, "INVALID_PAGE", "Trang không hợp lệ.");
    int size = size(requestedSize);
    var params = new HashMap<String, Object>();
    params.put("shop", shop.id);
    String predicate = "e.shopId=:shop";
    if (!seller) {
      predicate += " and e.customerId=:customer";
      params.put("customer", actor.id());
    }
    if (status != null && !status.isBlank()) {
      predicate += " and e.status=:status";
      params.put("status", status);
    }
    if (payment != null && !payment.isBlank()) {
      predicate += " and e.paymentStatus=:payment";
      params.put("payment", payment);
    }
    if (code != null && !code.isBlank()) {
      predicate += " and e.orderCode=:code";
      params.put("code", code);
    }
    if (date != null && !date.isBlank()) {
      try {
        var day = LocalDate.parse(date);
        var zone = ZoneId.of("Asia/Ho_Chi_Minh");
        params.put("from", day.atStartOfDay(zone).toInstant());
        params.put("to", day.plusDays(1).atStartOfDay(zone).toInstant());
        predicate += " and e.createdAt>=:from and e.createdAt<:to";
      } catch (Exception e) {
        throw new ApiException(400, "INVALID_DATE", "Ngày không hợp lệ.");
      }
    }
    long count = db.count(Order.class, predicate, params);
    return map(
        "content",
        db.page(Order.class, predicate, params, page, size, "e.createdAt desc,e.id asc").stream()
            .map(this::summary)
            .toList(),
        "page",
        page,
        "size",
        size,
        "totalElements",
        count,
        "totalPages",
        (count + size - 1) / size);
  }

  public Map<String, Object> view(Order o, boolean seller) {
    var out =
        map(
            "id",
            o.id,
            "orderCode",
            o.orderCode,
            "customerId",
            o.customerId,
            "buyerName",
            o.buyerName,
            "buyerPhone",
            o.buyerPhone,
            "buyerEmail",
            o.buyerEmail,
            "buyerClass",
            o.buyerClass,
            "pickupPointId",
            o.pickupPointId,
            "pickupPointName",
            o.pickupName,
            "pickupInstructions",
            o.pickupInstructions,
            "requestedPickupAt",
            o.requestedAt,
            "confirmedPickupAt",
            o.confirmedAt,
            "note",
            o.note,
            "paymentMethod",
            o.paymentMethod,
            "paymentStatus",
            o.paymentStatus,
            "status",
            o.status,
            "subtotal",
            o.subtotal,
            "total",
            o.total,
            "reservationExpiresAt",
            o.reservationExpiresAt,
            "version",
            o.version,
            "createdAt",
            o.createdAt,
            "updatedAt",
            o.updatedAt);
    out.put(
        "items",
        db.list(OrderItem.class, "e.orderId=:id", Map.of("id", o.id)).stream()
            .map(
                i ->
                    map(
                        "id",
                        i.id,
                        "kind",
                        i.kind,
                        "productId",
                        i.productId,
                        "comboId",
                        i.comboId,
                        "nameSnapshot",
                        i.nameSnapshot,
                        "imageAssetIdSnapshot",
                        i.imageAssetIdSnapshot,
                        "image",
                        catalog.image(i.imageAssetIdSnapshot),
                        "imageUrlSnapshot",
                        catalog.imageUrl(i.imageAssetIdSnapshot),
                        "unitPrice",
                        i.unitPrice,
                        "quantity",
                        i.quantity,
                        "lineTotal",
                        i.lineTotal,
                        "components",
                        db
                            .list(OrderComponent.class, "e.orderItemId=:id", Map.of("id", i.id))
                            .stream()
                            .map(
                                c ->
                                    map(
                                        "productId",
                                        c.productId,
                                        "nameSnapshot",
                                        c.nameSnapshot,
                                        "unitsPerItem",
                                        c.unitsPerItem))
                            .toList()))
            .toList());
    out.put(
        "statusHistory",
        db.list(StatusHistory.class, "e.orderId=:id", Map.of("id", o.id)).stream()
            .map(
                h ->
                    map(
                        "id",
                        h.id,
                        "fromStatus",
                        h.fromStatus,
                        "toStatus",
                        h.toStatus,
                        "actorType",
                        h.actorType,
                        "reason",
                        h.reason,
                        "createdAt",
                        h.createdAt))
            .toList());
    if (seller) {
      out.put("receivedAmount", o.receivedAmount);
      out.put("paymentSettingsVersionId", o.paymentSettingsVersionId);
      out.put(
          "contactAttempts",
          db.list(ContactAttempt.class, "e.orderId=:id", Map.of("id", o.id)).stream()
              .map(
                  c ->
                      map(
                          "id",
                          c.id,
                          "sellerId",
                          c.sellerId,
                          "channel",
                          c.channel,
                          "outcome",
                          c.outcome,
                          "note",
                          c.note,
                          "createdAt",
                          c.createdAt))
              .toList());
      out.put(
          "paymentEvents",
          db.list(PaymentEvent.class, "e.orderId=:id", Map.of("id", o.id)).stream()
              .map(
                  p ->
                      map(
                          "id",
                          p.id,
                          "type",
                          p.type,
                          "fromStatus",
                          p.fromStatus,
                          "toStatus",
                          p.toStatus,
                          "amount",
                          p.amount,
                          "bankReference",
                          p.bankReference,
                          "note",
                          p.note,
                          "occurredAt",
                          p.occurredAt,
                          "createdAt",
                          p.createdAt))
              .toList());
    }
    return out;
  }

  private Map<String, Object> summary(Order o) {
    return map(
        "id",
        o.id,
        "orderCode",
        o.orderCode,
        "buyerName",
        o.buyerName,
        "buyerPhone",
        o.buyerPhone,
        "buyerEmail",
        o.buyerEmail,
        "pickupPointName",
        o.pickupName,
        "status",
        o.status,
        "paymentStatus",
        o.paymentStatus,
        "paymentMethod",
        o.paymentMethod,
        "total",
        o.total,
        "subtotal",
        o.subtotal,
        "requestedPickupAt",
        o.requestedAt,
        "confirmedPickupAt",
        o.confirmedAt,
        "reservationExpiresAt",
        o.reservationExpiresAt,
        "version",
        o.version,
        "createdAt",
        o.createdAt,
        "updatedAt",
        o.updatedAt,
        "items",
        List.of());
  }

  @Transactional
  public Map<String, Object> action(
      Actor actor, UUID id, boolean seller, String action, String key, ActionInput input) {
    if (seller) profiles.seller(actor);
    shop.lock();
    var o = access.owned(id, actor, seller);
    return idem.run(
        actor,
        "order:" + id + ":" + action,
        key,
        input,
        () -> {
          ApiException.version(o.version, input.expectedVersion());
          String to =
              switch (action) {
                case "accept" -> "ACCEPTED";
                case "prepare" -> "PREPARING";
                case "ready" -> "READY";
                case "complete" -> "COMPLETED";
                case "reject" -> "REJECTED";
                case "cancel" -> "CANCELLED";
                default -> throw new ApiException(400, "INVALID_ACTION", "Action không hợp lệ.");
              };
          boolean contact =
              db.count(
                      ContactAttempt.class,
                      "e.orderId=:id and e.outcome='SUCCESS'",
                      Map.of("id", id))
                  > 0;
          OrderRules.transition(o.status, to, o.paymentStatus, seller, contact);
          if (to.equals("ACCEPTED")) {
            check(
                !o.reservationExpiresAt.isBefore(clock.instant())
                    || !o.paymentStatus.equals("UNPAID"),
                409,
                "RESERVATION_EXPIRED",
                "Đơn đã quá hạn giữ hàng.");
            check(
                input.confirmedPickupPointId() != null
                    && input.confirmedPickupAt() != null
                    && input.confirmedPickupAt().isAfter(clock.instant()),
                400,
                "CONFIRMED_PICKUP_REQUIRED",
                "Cần xác nhận điểm và thời gian nhận.");
            var p = settings.pickup(input.confirmedPickupPointId());
            o.pickupPointId = p.id;
            o.pickupName = p.name;
            o.pickupInstructions = p.instructions;
            o.confirmedAt = input.confirmedPickupAt();
          }
          if (to.equals("CANCELLED") || to.equals("REJECTED"))
            check(
                input.reason() != null && !input.reason().isBlank(),
                400,
                "REASON_REQUIRED",
                "Cần nhập lý do.");
          transition(o, to, actor, input.reason());
          db.flush();
          return view(o, seller);
        });
  }

  @Transactional
  public Map<String, Object> contact(Actor actor, UUID id, String key, ContactInput input) {
    profiles.seller(actor);
    shop.lock();
    var o = access.owned(id, actor, true);
    return idem.run(
        actor,
        "contact:" + id,
        key,
        input,
        () -> {
          ApiException.version(o.version, input.expectedVersion());
          check(!OrderRules.terminal(o.status), 409, "INVALID_TRANSITION", "Đơn đã kết thúc.");
          var c = new ContactAttempt();
          c.orderId = id;
          c.sellerId = actor.id();
          c.channel = input.channel();
          c.outcome = input.outcome();
          c.note = input.note();
          db.add(c);
          o.updatedAt = clock.instant();
          audit.record(
              actor,
              "CONTACT_RECORDED",
              "ORDER",
              id,
              null,
              "{\"outcome\":\"" + input.outcome() + "\"}");
          db.flush();
          return view(o, true);
        });
  }

  public void transition(Order o, String to, Actor actor, String reason) {
    String from = o.status;
    o.status = to;
    if (OrderRules.terminal(to)) {
      inventory.settle(o.id, to.equals("COMPLETED"), actor);
      if (!to.equals("COMPLETED")
          && (o.paymentStatus.equals("PAID") || o.receivedAmount.signum() > 0)) {
        String before = o.paymentStatus;
        o.paymentStatus = "REFUND_PENDING";
        var e = new PaymentEvent();
        e.shopId = shop.id;
        e.orderId = o.id;
        e.type = "REFUND_REQUIRED";
        e.fromStatus = before;
        e.toStatus = o.paymentStatus;
        e.amount = o.receivedAmount;
        e.actorId = actor.id();
        e.occurredAt = clock.instant();
        db.add(e);
        audit.record(actor, "REFUND_REQUIRED", "ORDER", o.id, null, null);
        audit.notifySellers("REFUND_REQUIRED", o.id);
      } else if (o.paymentStatus.equals("REPORTED"))
        audit.notifySellers("PAYMENT_REVIEW_REQUIRED", o.id);
    }
    var history = new StatusHistory();
    history.orderId = o.id;
    history.fromStatus = from;
    history.toStatus = to;
    history.actorId = actor.id();
    history.actorType = actor.type();
    history.reason = reason;
    db.add(history);
    audit.record(
        actor,
        "ORDER_" + to,
        "ORDER",
        o.id,
        "{\"status\":\"" + from + "\"}",
        "{\"status\":\"" + to + "\"}");
  }

  @Transactional
  public void expire() {
    shop.lock();
    for (var o :
        db.list(
            Order.class,
            "e.shopId=:shop and e.status='PENDING_CONTACT' and e.paymentStatus='UNPAID' and e.reservationExpiresAt<=:now",
            Map.of("shop", shop.id, "now", clock.instant()))) {
      db.lock(Order.class, o.id);
      if (o.status.equals("PENDING_CONTACT") && o.paymentStatus.equals("UNPAID"))
        transition(o, "EXPIRED", Actor.system(), "Hết hạn giữ hàng.");
    }
  }
}
