package vn.schoolshop.payment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.validation.constraints.*;
import vn.schoolshop.common.*;
import vn.schoolshop.shop.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.order.*;
import vn.schoolshop.infrastructure.*;
import vn.schoolshop.audit.AuditService;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.map;
@Service
public class PaymentService {
    private final DomainRepository db;private final ShopAccess shop;private final ProfileService profiles;private final OrderAccess access;private final OrderService orders;private final IdempotencyService idem;private final AuditService audit;private final Clock clock;private final StoragePort storage;
    public PaymentService(DomainRepository db,ShopAccess shop,ProfileService profiles,OrderAccess access,OrderService orders,IdempotencyService idem,AuditService audit,Clock clock,StoragePort storage){this.db=db;this.shop=shop;this.profiles=profiles;this.access=access;this.orders=orders;this.idem=idem;this.audit=audit;this.clock=clock;this.storage=storage;}
    public record Input(@NotNull @PositiveOrZero Long expectedVersion,@DecimalMin("1") @DecimalMax("99999999999999") @Digits(integer=14,fraction=0) BigDecimal amount,@Size(max=100) String bankReference,@Size(max=500) String note,@Size(max=500) String reason,@PastOrPresent Instant occurredAt){}
    @Transactional public Map<String,Object> action(Actor actor,UUID id,boolean seller,String action,String key,Input input){
        if(seller)profiles.seller(actor);shop.lock();var o=access.owned(id,actor,seller);
        return idem.run(actor,"payment:"+id+":"+action,key,input,()->{ApiException.version(o.version,input.expectedVersion());String from=o.paymentStatus;BigDecimal amount=null;String reference=null;String event;
            switch(action){
                case "payment-report" -> {check(o.paymentMethod.equals("BANK_TRANSFER")&&Set.of("ACCEPTED","PREPARING","READY").contains(o.status)&&from.equals("UNPAID"),409,"INVALID_PAYMENT_TRANSITION","Chỉ báo chuyển khoản sau khi đơn được chấp nhận.");o.paymentStatus="REPORTED";event="PAYMENT_REPORTED";audit.notifySellers(event,id);}
                case "confirm-payment" -> {check(seller,403,"SELLER_REQUIRED","Chỉ người bán được xác nhận tiền.");check(Set.of("UNPAID","REPORTED").contains(from),409,"INVALID_PAYMENT_TRANSITION","Khoản nhận đã được xử lý.");check(input.amount()!=null,400,"AMOUNT_REQUIRED","Cần nhập số tiền thực nhận.");amount=input.amount();o.receivedAmount=amount;
                    // One reconciliation receipt in MVP: discrepancies remain unpaid for manual resolution.
                    if(OrderRules.terminal(o.status)&&!o.status.equals("COMPLETED")){o.paymentStatus="REFUND_PENDING";event="PAYMENT_RECEIVED_AFTER_CANCELLATION";audit.notifySellers("REFUND_REQUIRED",id);}
                    else {check(!o.status.equals("COMPLETED"),409,"INVALID_PAYMENT_TRANSITION","Đơn đã hoàn tất.");o.paymentStatus=amount.compareTo(o.total)==0?"PAID":"REPORTED";event=amount.compareTo(o.total)==0?"PAYMENT_CONFIRMED":"PAYMENT_RECONCILIATION_REQUIRED";if(!o.paymentStatus.equals("PAID"))audit.notifySellers(event,id);}
                    reference=reference(input.bankReference());
                }
                case "dismiss-payment-report" -> {check(seller&&from.equals("REPORTED")&&o.receivedAmount.signum()==0,409,"INVALID_PAYMENT_TRANSITION","Không được bác báo cáo khi đã ghi nhận tiền thực nhận.");check(input.reason()!=null&&!input.reason().isBlank(),400,"REASON_REQUIRED","Cần nhập lý do.");o.paymentStatus="UNPAID";event="PAYMENT_REPORT_DISMISSED";}
                case "confirm-refund" -> {check(seller&&from.equals("REFUND_PENDING"),409,"INVALID_PAYMENT_TRANSITION","Đơn không chờ hoàn tiền.");check(input.amount()!=null&&input.amount().compareTo(o.receivedAmount)==0,400,"REFUND_AMOUNT_MISMATCH","Cần xác nhận hoàn đủ số tiền đã nhận.");amount=input.amount();reference=reference(input.bankReference());o.paymentStatus="REFUNDED";event="REFUND_CONFIRMED";}
                default -> throw new ApiException(400,"INVALID_ACTION","Action không hợp lệ.");
            }
            event(o,event,from,o.paymentStatus,amount,reference,actor,input.note(),input.occurredAt());audit.record(actor,event,"ORDER",id,"{\"paymentStatus\":\""+from+"\"}","{\"paymentStatus\":\""+o.paymentStatus+"\"}");db.flush();return orders.view(o,seller);
        });
    }
    private String reference(String reference){if(reference==null||reference.isBlank())return null;String normalized=reference.trim();check(db.count(PaymentEvent.class,"e.shopId=:shop and e.bankReference=:reference",Map.of("shop",shop.id,"reference",normalized))==0,409,"BANK_REFERENCE_DUPLICATE","Tham chiếu giao dịch đã được sử dụng.");return normalized;}
    private void event(Order o,String type,String from,String to,BigDecimal amount,String reference,Actor actor,String note,Instant occurred){var e=new PaymentEvent();e.shopId=shop.id;e.orderId=o.id;e.type=type;e.fromStatus=from;e.toStatus=to;e.amount=amount;e.bankReference=reference;e.actorId=actor.id();e.note=note;e.occurredAt=occurred==null?clock.instant():occurred;db.add(e);}
    @Transactional(readOnly=true) public Object instructions(Actor actor,UUID id,boolean seller){if(seller)profiles.seller(actor);var o=access.owned(id,actor,seller);check(o.paymentMethod.equals("BANK_TRANSFER")&&o.paymentSettingsVersionId!=null,409,"NO_BANK_INSTRUCTIONS","Đơn không dùng chuyển khoản.");var settings=db.find(PaymentSettings.class,o.paymentSettingsVersionId);var asset=db.find(Asset.class,settings.qrAssetId);return map("orderCode",o.orderCode,"bankName",settings.bankName,"accountNumber",settings.accountNumber,"accountHolder",settings.accountHolder,"amount",o.total,"transferContent",o.orderCode,"qrSignedUrl",storage.signed(asset.bucket,asset.objectPath,300),"expiresIn",300,"paymentSettingsVersionId",settings.id,"waitForAcceptance",o.status.equals("PENDING_CONTACT"));}
}
