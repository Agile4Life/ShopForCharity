package vn.schoolshop.audit;

import java.util.*;
import org.springframework.stereotype.Service;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.shop.ShopAccess;

@Service
public class AuditService {
  private final DomainRepository db;
  private final ShopAccess shop;

  public AuditService(DomainRepository db, ShopAccess shop) {
    this.db = db;
    this.shop = shop;
  }

  public void record(
      Actor actor, String action, String type, UUID id, String before, String after) {
    var log = new AuditLog();
    log.shopId = shop.id;
    log.actorId = actor.id();
    log.actorType = actor.type();
    log.action = action;
    log.entityType = type;
    log.entityId = id;
    log.safeBefore = before;
    log.safeAfter = after;
    log.requestId = RequestContext.id();
    db.add(log);
  }

  public void notifySellers(String type, UUID order) {
    for (var seller : db.list(Profile.class, "e.role='SELLER' and e.active=true", Map.of())) {
      var n = new Notification();
      n.shopId = shop.id;
      n.recipientProfileId = seller.id;
      n.type = type;
      n.orderId = order;
      n.isRead = false;
      db.add(n);
    }
  }
}
