package vn.schoolshop.order;
import org.springframework.stereotype.Service;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.shop.ShopAccess;
import java.util.*;
@Service
public class OrderAccess {
    private final DomainRepository db;private final ShopAccess shop;
    public OrderAccess(DomainRepository db,ShopAccess shop){this.db=db;this.shop=shop;}
    public Order owned(UUID id,Actor actor,boolean seller){var o=db.find(Order.class,id);shop.same(o.shopId);authorize(o,actor,seller);return o;}
    public Order code(String code,Actor actor){var rows=db.list(Order.class,"e.shopId=:shop and e.orderCode=:code",Map.of("shop",shop.id,"code",code));if(rows.isEmpty())throw ApiException.missing();var o=rows.getFirst();authorize(o,actor,false);return o;}
    public void authorize(Order o,Actor actor,boolean seller){
        if(seller&&actor.type().equals("SELLER"))return;
        if(actor.id()!=null&&actor.id().equals(o.customerId))return;
        if(actor.id()==null&&o.customerId==null&&o.id.equals(actor.guestOrderId()))return;
        throw ApiException.missing();
    }
}
