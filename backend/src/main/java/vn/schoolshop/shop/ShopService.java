package vn.schoolshop.shop;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.catalog.CatalogService;
import vn.schoolshop.audit.AuditService;
import java.util.*;
import static vn.schoolshop.common.Views.*;
import static vn.schoolshop.common.ApiException.check;
@Service
public class ShopService {
    private final ShopAccess shop;private final DomainRepository db;private final ProfileService profiles;private final CatalogService catalog;private final AuditService audit;
    public ShopService(ShopAccess shop,DomainRepository db,ProfileService profiles,CatalogService catalog,AuditService audit){this.shop=shop;this.db=db;this.profiles=profiles;this.catalog=catalog;this.audit=audit;}
    public PickupPoint pickup(UUID id){var p=db.find(PickupPoint.class,id);shop.same(p.shopId);check(p.active,400,"INVALID_PICKUP_POINT","Điểm nhận không hoạt động.");return p;}
    @Transactional(readOnly=true) public Map<String,Object> get(boolean seller,Actor actor){
        if(seller)profiles.seller(actor);var s=shop.get();var out=map("id",s.id,"name",s.name,"contactPhone",s.contactPhone,"contactEmail",s.contactEmail,"acceptingOrders",s.acceptingOrders,"version",s.version,"pickupPoints",points(seller));
        if(seller){out.put("paymentSettingsVersionId",s.paymentSettingsVersionId);if(s.paymentSettingsVersionId!=null){var b=db.find(PaymentSettings.class,s.paymentSettingsVersionId);out.put("bank",map("bankName",b.bankName,"accountNumber",b.accountNumber,"accountHolder",b.accountHolder,"qrAssetId",b.qrAssetId,"versionId",b.id));}}return out;
    }
    public List<Map<String,Object>> points(boolean seller){return db.list(PickupPoint.class,"e.shopId=:shop"+(seller?"":" and e.active=true"),Map.of("shop",shop.id)).stream().map(p->map("id",p.id,"name",p.name,"instructions",p.instructions,"active",p.active,"version",p.version)).toList();}
    @Transactional public Object update(Actor actor,SettingsInput input){
        profiles.seller(actor);var s=shop.lock();ApiException.version(s.version,input.expectedVersion());s.name=input.name().trim();s.contactPhone=input.contactPhone();s.contactEmail=input.contactEmail();s.acceptingOrders=input.acceptingOrders();
        if(input.bank()!=null){var b=input.bank();catalog.asset(b.qrAssetId(),"PAYMENT_QR");var payment=new PaymentSettings();payment.shopId=shop.id;payment.bankName=b.bankName().trim();payment.accountNumber=b.accountNumber().trim();payment.accountHolder=b.accountHolder().trim();payment.qrAssetId=b.qrAssetId();payment.createdBy=actor.id();db.add(payment);s.paymentSettingsVersionId=payment.id;audit.record(actor,"PAYMENT_SETTINGS_VERSION_CREATED","PAYMENT_SETTINGS",payment.id,null,null);}
        audit.record(actor,"SHOP_SETTINGS_UPDATED","SHOP",s.id,null,"{\"acceptingOrders\":"+s.acceptingOrders+"}");db.flush();return get(true,actor);
    }
    @Transactional public Object savePoint(Actor actor,UUID id,PointInput input){
        profiles.seller(actor);shop.lock();var p=id==null?new PickupPoint():db.find(PickupPoint.class,id);if(id!=null){shop.same(p.shopId);ApiException.version(p.version,input.expectedVersion());}p.shopId=shop.id;p.name=input.name().trim();p.instructions=input.instructions();p.active=input.active();if(id==null)db.add(p);audit.record(actor,"PICKUP_POINT_CHANGED","PICKUP_POINT",p.id,null,"{\"active\":"+p.active+"}");db.flush();return map("id",p.id,"name",p.name,"instructions",p.instructions,"active",p.active,"version",p.version);
    }
    public record BankInput(@NotBlank @Size(max=100) String bankName,@NotBlank @Size(max=100) String accountNumber,@NotBlank @Size(max=100) String accountHolder,@NotNull UUID qrAssetId){}
    public record SettingsInput(@NotBlank @Size(max=100) String name,@Size(max=30) String contactPhone,@Email @Size(max=254) String contactEmail,boolean acceptingOrders,@Valid BankInput bank,@PositiveOrZero long expectedVersion){}
    public record PointInput(@NotBlank @Size(max=100) String name,@Size(max=500) String instructions,boolean active,@PositiveOrZero long expectedVersion){}
}
