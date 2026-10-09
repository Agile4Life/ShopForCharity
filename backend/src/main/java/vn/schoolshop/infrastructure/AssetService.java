package vn.schoolshop.infrastructure;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import org.springframework.beans.factory.annotation.Value;
import vn.schoolshop.common.*;
import vn.schoolshop.shop.ShopAccess;
import vn.schoolshop.identity.*;
import java.time.*;
import java.util.*;
import static vn.schoolshop.common.Views.map;
import static vn.schoolshop.common.ApiException.check;
@Service
public class AssetService {
    private final DomainRepository db;private final ShopAccess shop;private final ProfileService profiles;private final StoragePort storage;private final ImageProcessor images;private final String products,payments;private final Clock clock;
    public AssetService(DomainRepository db,ShopAccess shop,ProfileService profiles,StoragePort storage,ImageProcessor images,@Value("${app.product-bucket}") String products,@Value("${app.payment-bucket}") String payments,Clock clock){this.db=db;this.shop=shop;this.profiles=profiles;this.storage=storage;this.images=images;this.products=products;this.payments=payments;this.clock=clock;}
    @Transactional public Object upload(Actor actor,String type,byte[] bytes,String mime){
        profiles.seller(actor);check(Set.of("PRODUCT_IMAGE","PAYMENT_QR").contains(type),400,"INVALID_ASSET_TYPE","Loại ảnh không hợp lệ.");var processed=images.process(bytes,mime,type.equals("PAYMENT_QR"));shop.lock();var a=new Asset();a.shopId=shop.id;a.type=type;a.bucket=type.equals("PAYMENT_QR")?payments:products;a.objectPath=shop.id+"/"+a.id+".png";a.mime="image/png";a.size=processed.image().length;a.createdBy=actor.id();a.thumbnailPath=processed.thumbnail()==null?null:shop.id+"/"+a.id+"-thumb.png";
        var uploaded=new ArrayList<String>();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)for(var path:uploaded)try{storage.delete(a.bucket,path);}catch(Exception ignored){org.slf4j.LoggerFactory.getLogger(AssetService.class).warn("Upload compensation pending assetId={}",a.id);}}});
        storage.upload(a.bucket,a.objectPath,processed.image(),a.mime);uploaded.add(a.objectPath);if(a.thumbnailPath!=null){storage.upload(a.bucket,a.thumbnailPath,processed.thumbnail(),a.mime);uploaded.add(a.thumbnailPath);}db.add(a);db.flush();return map("assetId",a.id,"objectPath",a.objectPath,"url",type.equals("PRODUCT_IMAGE")?storage.publicUrl(a.bucket,a.objectPath):storage.signed(a.bucket,a.objectPath,300));
    }
    @Transactional public void cleanup(){shop.lock();
        for(var a:db.list(Asset.class,"e.shopId=:shop and e.createdAt<:cutoff",Map.of("shop",shop.id,"cutoff",clock.instant().minus(Duration.ofHours(24))))){
            boolean used=db.count(vn.schoolshop.catalog.Product.class,"e.imageAssetId=:id",Map.of("id",a.id))>0||db.count(vn.schoolshop.catalog.Combo.class,"e.imageAssetId=:id",Map.of("id",a.id))>0||db.count(vn.schoolshop.order.OrderItem.class,"e.imageAssetIdSnapshot=:id",Map.of("id",a.id))>0||db.count(vn.schoolshop.shop.PaymentSettings.class,"e.qrAssetId=:id",Map.of("id",a.id))>0;
            if(!used){storage.delete(a.bucket,a.objectPath);if(a.thumbnailPath!=null)storage.delete(a.bucket,a.thumbnailPath);db.remove(a);}
        }
        db.execute("delete from IdempotencyRecord e where e.expiresAt<:now",Map.of("now",clock.instant()));
    }
}
