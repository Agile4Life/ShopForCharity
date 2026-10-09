package vn.schoolshop.catalog;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.common.*;
import vn.schoolshop.shop.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.inventory.Inventory;
import vn.schoolshop.infrastructure.Asset;
import java.util.*;
import java.math.BigDecimal;
import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.*;
import static vn.schoolshop.catalog.CatalogDtos.*;

@Service
public class CatalogService {
    private final DomainRepository db;private final ShopAccess shop;private final ProfileService profiles;private final AuditService audit;
    public CatalogService(DomainRepository db,ShopAccess shop,ProfileService profiles,AuditService audit){this.db=db;this.shop=shop;this.profiles=profiles;this.audit=audit;}
    public Product product(UUID id,boolean publicOnly){var p=db.find(Product.class,id);shop.same(p.shopId);if(publicOnly&&!p.status.equals("ACTIVE"))throw ApiException.missing();return p;}
    public Combo combo(UUID id,boolean publicOnly){var c=db.find(Combo.class,id);shop.same(c.shopId);if(publicOnly&&!c.status.equals("ACTIVE"))throw ApiException.missing();return c;}
    public List<ComboItem> components(UUID id){return db.list(ComboItem.class,"e.comboId=:id",Map.of("id",id));}
    public void asset(UUID id,String type){if(id==null)return;var a=db.find(Asset.class,id);shop.same(a.shopId);check(type.equals(a.type),400,"INVALID_ASSET","Loại ảnh không phù hợp.");}
    @Transactional(readOnly=true) public Object categories(){return db.list(Category.class,"e.shopId=:shop and e.active=true",Map.of("shop",shop.id)).stream().map(c->map("id",c.id,"code",c.code,"name",c.name)).toList();}
    @Transactional(readOnly=true) public Object list(boolean combos,boolean seller,String q,String category,String sort,int page,int requestedSize,Actor actor){
        if(seller)profiles.seller(actor);int size=size(requestedSize);check(page>=0&&page<=100000,400,"INVALID_PAGE","Trang không hợp lệ.");
        String predicate="e.shopId=:shop"+(seller?"":" and e.status='ACTIVE'");var params=new HashMap<String,Object>();params.put("shop",shop.id);
        if(q!=null&&!q.isBlank()){predicate+=" and lower(e.name) like :q";params.put("q","%"+q.toLowerCase(Locale.ROOT).replace("%","").replace("_","")+"%");}
        if(!combos&&category!=null&&!category.isBlank()){
            predicate+=" and e.categoryId in (select c.id from Category c where c.shopId=:shop and (c.code=:category or cast(c.id as string)=:category))";params.put("category",category);
        }
        String order=switch(sort==null?"newest":sort){case "price_asc"->"e.price asc,e.id asc";case "price_desc"->"e.price desc,e.id asc";case "newest"->"e.createdAt desc,e.id asc";default->throw new ApiException(400,"INVALID_SORT","Sắp xếp không hợp lệ.");};
        Class<?> type=combos?Combo.class:Product.class;
        List<?> rows=db.page(type,predicate,params,page,size,order);
        return map("content",rows.stream().map(x->x instanceof Product p?productView(p,seller):comboView((Combo)x,seller)).toList(),"page",page,"size",size,"totalElements",db.count(type,predicate,params));
    }
    @Transactional(readOnly=true) public Object detail(boolean combos,UUID id,boolean seller,Actor actor){if(seller)profiles.seller(actor);return combos?comboView(combo(id,!seller),seller):productView(product(id,!seller),seller);}
    public Map<String,Object> productView(Product p,boolean seller){
        var i=db.find(Inventory.class,p.id);var out=map("id",p.id,"kind","PRODUCT","slug",p.slug,"name",p.name,"categoryId",p.categoryId,"description",p.description,"price",p.price,"imageAssetId",p.imageAssetId,"ingredients",p.ingredients,"storageInstructions",p.storageInstructions,"availableStock",i.stockOnHand-i.stockReserved,"soldOut",i.stockOnHand==i.stockReserved,"version",p.version,"image",image(p.imageAssetId));
        if(seller)out.putAll(map("status",p.status,"stockOnHand",i.stockOnHand,"stockReserved",i.stockReserved,"inventoryVersion",i.version));return out;
    }
    public Map<String,Object> image(UUID id){if(id==null)return null;var a=db.find(Asset.class,id);return map("assetId",a.id,"objectPath",a.objectPath,"thumbnailPath",a.thumbnailPath,"bucket",a.bucket);}
    public Map<String,Object> comboView(Combo c,boolean seller){
        int available=Integer.MAX_VALUE;BigDecimal retail=BigDecimal.ZERO;var items=new ArrayList<Object>();
        for(var item:components(c.id)){var p=product(item.productId,false);var i=db.find(Inventory.class,p.id);available=Math.min(available,p.status.equals("ACTIVE")?(i.stockOnHand-i.stockReserved)/item.quantity:0);retail=retail.add(p.price.multiply(BigDecimal.valueOf(item.quantity)));items.add(map("productId",p.id,"name",p.name,"quantity",item.quantity));}
        if(items.isEmpty())available=0;
        var out=map("id",c.id,"kind","COMBO","slug",c.slug,"name",c.name,"description",c.description,"price",c.price,"imageAssetId",c.imageAssetId,"image",image(c.imageAssetId),"items",items,"availableStock",available,"soldOut",available==0,"retailTotal",retail,"savings",retail.subtract(c.price).max(BigDecimal.ZERO),"version",c.version);
        if(seller)out.putAll(map("status",c.status,"priceWarning",c.price.compareTo(retail)>0));return out;
    }
    @Transactional public Object saveProduct(Actor actor,UUID id,ProductInput input){
        profiles.seller(actor);shop.lock();var category=db.find(Category.class,input.categoryId());shop.same(category.shopId);check(category.active,400,"INVALID_CATEGORY","Danh mục không hoạt động.");asset(input.imageAssetId(),"PRODUCT_IMAGE");
        boolean create=id==null;var p=create?new Product():product(id,false);if(!create)ApiException.version(p.version,input.expectedVersion());
        String before=create?null:"{\"price\":"+p.price+"}";
        p.shopId=shop.id;p.name=input.name().trim();p.slug=input.slug();p.categoryId=input.categoryId();p.description=input.description();p.price=input.price();p.imageAssetId=input.imageAssetId();p.ingredients=input.ingredients();p.storageInstructions=input.storageInstructions();
        if(create){p.status="DRAFT";db.add(p);var inventory=new Inventory();inventory.id=p.id;inventory.stockOnHand=input.initialStock();db.add(inventory);}
        audit.record(actor,create?"PRODUCT_CREATED":"PRODUCT_UPDATED","PRODUCT",p.id,before,"{\"price\":"+p.price+"}");db.flush();return productView(p,true);
    }
    @Transactional public Object saveCombo(Actor actor,UUID id,ComboInput input){
        profiles.seller(actor);shop.lock();asset(input.imageAssetId(),"PRODUCT_IMAGE");var seen=new HashSet<UUID>();BigDecimal retail=BigDecimal.ZERO;
        for(var part:input.items()){check(seen.add(part.productId()),400,"DUPLICATE_COMPONENT","Thành phần combo bị trùng.");var p=product(part.productId(),true);retail=retail.add(p.price.multiply(BigDecimal.valueOf(part.quantity())));}
        check(input.price().compareTo(retail)<=0,400,"INVALID_COMBO_PRICE","Giá combo không được vượt tổng giá lẻ.");
        boolean create=id==null;var c=create?new Combo():combo(id,false);if(!create)ApiException.version(c.version,input.expectedVersion());c.shopId=shop.id;c.name=input.name().trim();c.slug=input.slug();c.description=input.description();c.price=input.price();c.imageAssetId=input.imageAssetId();if(create){c.status="DRAFT";db.add(c);}else {for(var part:components(c.id))db.remove(part);db.flush();}
        for(var part:input.items()){var item=new ComboItem();item.comboId=c.id;item.productId=part.productId();item.quantity=part.quantity();db.add(item);}
        audit.record(actor,create?"COMBO_CREATED":"COMBO_UPDATED","COMBO",c.id,null,"{\"price\":"+c.price+"}");db.flush();return comboView(c,true);
    }
    @Transactional public Object status(Actor actor,boolean combos,UUID id,String status,long expected){
        profiles.seller(actor);shop.lock();
        if(combos){var c=combo(id,false);ApiException.version(c.version,expected);if(status.equals("ACTIVE")){check(c.imageAssetId!=null,400,"IMAGE_REQUIRED","Cần ảnh trước khi mở bán.");var parts=components(id);check(parts.size()>=2,400,"INVALID_COMBO","Combo cần ít nhất hai món.");for(var part:parts)product(part.productId,true);}c.status=status;audit.record(actor,"COMBO_"+(status.equals("ACTIVE")?"ACTIVATED":"ARCHIVED"),"COMBO",id,null,"{\"status\":\""+status+"\"}");db.flush();return comboView(c,true);}
        var p=product(id,false);ApiException.version(p.version,expected);if(status.equals("ACTIVE"))check(p.imageAssetId!=null,400,"IMAGE_REQUIRED","Cần ảnh trước khi mở bán.");p.status=status;audit.record(actor,"PRODUCT_"+(status.equals("ACTIVE")?"ACTIVATED":"ARCHIVED"),"PRODUCT",id,null,"{\"status\":\""+status+"\"}");db.flush();return productView(p,true);
    }
}
