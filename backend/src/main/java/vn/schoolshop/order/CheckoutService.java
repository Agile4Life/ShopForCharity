package vn.schoolshop.order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import vn.schoolshop.common.*;
import vn.schoolshop.catalog.*;
import vn.schoolshop.shop.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.inventory.*;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.infrastructure.*;
import java.time.*;
import java.util.*;
import java.math.BigDecimal;
import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.map;
import static vn.schoolshop.order.CheckoutDtos.*;
@Service
public class CheckoutService {
    private final DomainRepository db;private final ShopAccess shop;private final ShopService settings;private final CatalogService catalog;private final InventoryService inventory;private final IdempotencyService idem;private final Crypto crypto;private final AuditService audit;private final Clock clock;private final long pendingHours,guestDays;
    public CheckoutService(DomainRepository db,ShopAccess shop,ShopService settings,CatalogService catalog,InventoryService inventory,IdempotencyService idem,Crypto crypto,AuditService audit,Clock clock,@Value("${app.pending-ttl-hours}") long pendingHours,@Value("${app.guest-ttl-days}") long guestDays){this.db=db;this.shop=shop;this.settings=settings;this.catalog=catalog;this.inventory=inventory;this.idem=idem;this.crypto=crypto;this.audit=audit;this.clock=clock;this.pendingHours=pendingHours;this.guestDays=guestDays;}
    record Part(UUID productId,String name,int quantity){}
    record Line(CartLine request,String name,UUID image,BigDecimal price,long version,List<Part> parts){}
    record Resolved(List<Line> lines,Map<UUID,Integer> demand,BigDecimal total,String fingerprint){}
    Resolved resolve(List<CartLine> input){
        check(input!=null&&!input.isEmpty()&&input.size()<=30,400,"INVALID_CART","Giỏ cần 1–30 dòng.");var seen=new HashSet<String>();var lines=new ArrayList<Line>();var demand=new TreeMap<UUID,Integer>();BigDecimal total=BigDecimal.ZERO;var signature=new StringBuilder();
        var sorted=new ArrayList<>(input);sorted.sort(Comparator.comparing(CartLine::kind).thenComparing(CartLine::catalogId));
        for(var req:sorted){check(req.quantity()>=1&&req.quantity()<=20,400,"INVALID_QUANTITY","Số lượng từ 1 đến 20.");check(seen.add(req.kind()+req.catalogId()),400,"DUPLICATE_CART_LINE","Gộp các dòng trùng trước khi gửi.");Line line;
            if(req.kind().equals("PRODUCT")){var p=catalog.product(req.catalogId(),true);line=new Line(req,p.name,p.imageAssetId,p.price,p.version,List.of(new Part(p.id,p.name,1)));}
            else {check(req.kind().equals("COMBO"),400,"INVALID_KIND","Loại món không hợp lệ.");var c=catalog.combo(req.catalogId(),true);var parts=new ArrayList<Part>();for(var ci:catalog.components(c.id)){var p=catalog.product(ci.productId,true);parts.add(new Part(p.id,p.name,ci.quantity));signature.append(p.id).append(':').append(p.version).append(':').append(p.price).append(';');}check(parts.size()>=2,409,"CATALOG_UNAVAILABLE","Combo không thể đặt.");parts.sort(Comparator.comparing(Part::productId));line=new Line(req,c.name,c.imageAssetId,c.price,c.version,parts);}
            lines.add(line);total=total.add(line.price.multiply(BigDecimal.valueOf(req.quantity())));signature.append(req.kind()).append(req.catalogId()).append(':').append(req.quantity()).append(':').append(line.version).append(':').append(line.price).append(';');
            for(var part:line.parts){demand.merge(part.productId,Math.multiplyExact(part.quantity,req.quantity()),Math::addExact);signature.append(part.productId).append(':').append(part.quantity).append(';');}
        }
        var s=shop.get();signature.append(s.version).append(':').append(s.paymentSettingsVersionId).append(':').append(s.acceptingOrders);
        check(total.compareTo(new BigDecimal("99999999999999"))<=0,400,"TOTAL_TOO_LARGE","Tổng đơn vượt giới hạn.");return new Resolved(lines,demand,total,Crypto.hash(signature.toString()));
    }
    @Transactional public Map<String,Object> quote(QuoteInput input){shop.lock();if("BANK_TRANSFER".equals(input.paymentMethod()))check(shop.get().paymentSettingsVersionId!=null,409,"BANK_NOT_CONFIGURED","Shop chưa cấu hình chuyển khoản.");return quoteView(resolve(input.items()),input.paymentMethod());}
    private Map<String,Object> quoteView(Resolved resolved,String method){
        var expires=clock.instant().plus(Duration.ofMinutes(5));var items=new ArrayList<Object>();var insufficient=new ArrayList<Object>();
        for(var entry:resolved.demand.entrySet()){var i=db.find(Inventory.class,entry.getKey());if(i.stockOnHand-i.stockReserved<entry.getValue())insufficient.add(map("productId",entry.getKey(),"requiredQuantity",entry.getValue(),"availableQuantity",i.stockOnHand-i.stockReserved));}
        for(var l:resolved.lines){int available=Integer.MAX_VALUE;for(var part:l.parts){var i=db.find(Inventory.class,part.productId);available=Math.min(available,(i.stockOnHand-i.stockReserved)/part.quantity);}items.add(map("kind",l.request.kind(),"catalogId",l.request.catalogId(),"name",l.name,"unitPrice",l.price,"quantity",l.request.quantity(),"lineTotal",l.price.multiply(BigDecimal.valueOf(l.request.quantity())),"availableStock",available,"isAvailable",insufficient.isEmpty()));}
        return map("quoteToken",crypto.sign("quote|"+resolved.fingerprint+"|"+(method==null?"ANY":method)+"|"+expires.getEpochSecond()),"expiresAt",expires,"subtotal",resolved.total,"total",resolved.total,"items",items,"isAvailable",insufficient.isEmpty(),"stockConflicts",insufficient);
    }
    @Transactional public Map<String,Object> create(Actor actor,String key,CreateInput input){
        shop.lock();return idem.run(actor,"create-order",key,input,()->{
            var s=shop.get();check(s.acceptingOrders,409,"SHOP_CLOSED","Shop đang tạm dừng nhận đơn.");var pickup=settings.pickup(input.pickupPointId());Resolved resolved;
            try{resolved=resolve(input.items());}catch(ApiException e){if(e.status==404)throw new ApiException(409,"CHECKOUT_CHANGED","Catalog đã thay đổi. Vui lòng kiểm tra lại giỏ.");throw e;}
            String[] p;
            try{p=crypto.verify(input.quoteToken()).split("\\|");}catch(ApiException e){throw new ApiException(400,"INVALID_QUOTE","Quote không hợp lệ.");}
            check(p.length==4&&p[0].equals("quote"),400,"INVALID_QUOTE","Quote không hợp lệ.");
            boolean valid;try{valid=Long.parseLong(p[3])>clock.instant().getEpochSecond();}catch(Exception e){throw new ApiException(400,"INVALID_QUOTE","Quote không hợp lệ.");}
            if(!valid||!p[1].equals(resolved.fingerprint)||(!p[2].equals("ANY")&&!p[2].equals(input.paymentMethod())))throw new ApiException(409,"CHECKOUT_CHANGED","Giá hoặc cấu hình đã thay đổi. Vui lòng xác nhận lại.",map("quote",quoteView(resolved,input.paymentMethod())));
            if(input.paymentMethod().equals("BANK_TRANSFER"))check(s.paymentSettingsVersionId!=null,409,"BANK_NOT_CONFIGURED","Shop chưa cấu hình chuyển khoản.");
            check(input.requestedPickupAt()==null||input.requestedPickupAt().isAfter(clock.instant()),400,"INVALID_PICKUP_TIME","Thời gian nhận phải trong tương lai.");
            String name=input.buyer().fullName().trim();check(name.length()>=2,400,"INVALID_BUYER_NAME","Họ tên cần ít nhất 2 ký tự.");
            var o=new Order();o.shopId=shop.id;o.orderCode="ORD-"+UUID.randomUUID().toString().replace("-","").substring(0,16).toUpperCase(Locale.ROOT);o.customerId=actor.id();o.buyerName=name;o.buyerPhone=Phone.normalize(input.buyer().phone());o.buyerEmail=input.buyer().email().trim();o.buyerClass=input.buyer().className();o.pickupPointId=pickup.id;o.pickupName=pickup.name;o.pickupInstructions=pickup.instructions;o.requestedAt=input.requestedPickupAt();o.note=input.note();o.paymentMethod=input.paymentMethod();o.paymentStatus="UNPAID";o.status="PENDING_CONTACT";o.subtotal=resolved.total;o.total=resolved.total;o.receivedAmount=BigDecimal.ZERO;o.paymentSettingsVersionId=input.paymentMethod().equals("BANK_TRANSFER")?s.paymentSettingsVersionId:null;o.reservationExpiresAt=clock.instant().plus(Duration.ofHours(pendingHours));
            String guest=null;if(actor.id()==null){guest=crypto.token();o.guestTokenHash=Crypto.hash(guest);o.guestTokenExpiresAt=clock.instant().plus(Duration.ofDays(guestDays));}
            db.add(o);
            for(var l:resolved.lines){var item=new OrderItem();item.orderId=o.id;item.kind=l.request.kind();item.productId=item.kind.equals("PRODUCT")?l.request.catalogId():null;item.comboId=item.kind.equals("COMBO")?l.request.catalogId():null;item.nameSnapshot=l.name;item.imageAssetIdSnapshot=l.image;item.unitPrice=l.price;item.quantity=l.request.quantity();item.lineTotal=l.price.multiply(BigDecimal.valueOf(item.quantity));db.add(item);for(var part:l.parts){var component=new OrderComponent();component.orderItemId=item.id;component.productId=part.productId;component.nameSnapshot=part.name;component.unitsPerItem=part.quantity;db.add(component);}}
            inventory.reserve(o.id,resolved.demand,actor);var history=new StatusHistory();history.orderId=o.id;history.toStatus=o.status;history.actorId=actor.id();history.actorType=actor.type();db.add(history);audit.record(actor,"ORDER_CREATED","ORDER",o.id,null,"{\"total\":"+o.total+"}");audit.notifySellers("ORDER_CREATED",o.id);db.flush();
            var out=map("orderId",o.id,"orderCode",o.orderCode,"status",o.status,"paymentStatus",o.paymentStatus,"total",o.total,"reservationExpiresAt",o.reservationExpiresAt,"version",o.version);if(guest!=null)out.put("guestAccessToken",guest);return out;
        });
    }
}
