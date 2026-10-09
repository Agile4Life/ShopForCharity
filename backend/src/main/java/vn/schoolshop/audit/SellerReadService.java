package vn.schoolshop.audit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.shop.ShopAccess;
import vn.schoolshop.order.Order;
import java.util.*;
import java.math.BigDecimal;
import java.time.*;
import static vn.schoolshop.common.Views.*;
@Service
public class SellerReadService {
    private final DomainRepository db;private final ShopAccess shop;private final ProfileService profiles;
    public SellerReadService(DomainRepository db,ShopAccess shop,ProfileService profiles){this.db=db;this.shop=shop;this.profiles=profiles;}
    @Transactional(readOnly=true) public Object dashboard(Actor actor){profiles.seller(actor);String base="e.shopId=:shop";var p=Map.of("shop",shop.id);BigDecimal completed=BigDecimal.ZERO,pending=BigDecimal.ZERO;
        for(var o:db.list(Order.class,base+" and e.paymentStatus='PAID'",p)){if(o.status.equals("COMPLETED"))completed=completed.add(o.total);else pending=pending.add(o.receivedAmount);}
        return map("pendingCount",db.count(Order.class,base+" and e.status='PENDING_CONTACT'",p),"readyCount",db.count(Order.class,base+" and e.status='READY'",p),"completedRevenue",completed,"pendingRevenue",pending);
    }
    @Transactional(readOnly=true) public Object notifications(Actor actor,int page,int requestedSize){profiles.seller(actor);int size=size(requestedSize);var p=Map.of("shop",shop.id,"recipient",actor.id());String predicate="e.shopId=:shop and e.recipientProfileId=:recipient";long count=db.count(Notification.class,predicate,p);return map("content",db.page(Notification.class,predicate,p,page,size,"e.createdAt desc").stream().map(n->map("id",n.id,"type",n.type,"orderId",n.orderId,"isRead",n.isRead,"createdAt",n.createdAt)).toList(),"page",page,"size",size,"totalElements",count,"totalPages",(count+size-1)/size,"unreadCount",db.count(Notification.class,predicate+" and e.isRead=false",p));}
    @Transactional public Object read(Actor actor,UUID id){profiles.seller(actor);shop.lock();var n=db.find(Notification.class,id);shop.same(n.shopId);if(!n.recipientProfileId.equals(actor.id()))throw ApiException.missing();n.isRead=true;return map("success",true);}
    @Transactional(readOnly=true) public Object audit(Actor actor,String action,String entityType,String date,int page,int requestedSize){
        profiles.seller(actor);int size=size(requestedSize);var p=new HashMap<String,Object>();p.put("shop",shop.id);String predicate="e.shopId=:shop";
        if(action!=null&&!action.isBlank()){predicate+=" and e.action=:action";p.put("action",action);}if(entityType!=null&&!entityType.isBlank()){predicate+=" and e.entityType=:type";p.put("type",entityType);}
        if(date!=null&&!date.isBlank()){try{var day=LocalDate.parse(date);var zone=ZoneId.of("Asia/Ho_Chi_Minh");p.put("from",day.atStartOfDay(zone).toInstant());p.put("to",day.plusDays(1).atStartOfDay(zone).toInstant());predicate+=" and e.createdAt>=:from and e.createdAt<:to";}catch(Exception e){throw new ApiException(400,"INVALID_DATE","Ngày không hợp lệ.");}}
        long count=db.count(AuditLog.class,predicate,p);return map("content",db.page(AuditLog.class,predicate,p,page,size,"e.createdAt desc").stream().map(a->map("id",a.id,"actorId",a.actorId,"actorType",a.actorType,"action",a.action,"entityType",a.entityType,"entityId",a.entityId,"safeBefore",a.safeBefore,"safeAfter",a.safeAfter,"requestId",a.requestId,"createdAt",a.createdAt)).toList(),"page",page,"size",size,"totalElements",count,"totalPages",(count+size-1)/size);
    }
}
