package vn.schoolshop.order;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.catalog.*;
import vn.schoolshop.common.*;
import vn.schoolshop.infrastructure.*;
import vn.schoolshop.inventory.*;
import vn.schoolshop.shop.*;

class CheckoutServiceTest {
  @Test
  void mixedCartAggregatesProductAndComboDemandAndIgnoresClientPricing() {
    var db = mock(DomainRepository.class);
    var shop = mock(ShopAccess.class);
    var catalog = mock(CatalogService.class);
    var s = new Shop();
    s.acceptingOrders = true;
    when(shop.get()).thenReturn(s);
    var product = new Product();
    product.name = "Bánh";
    product.price = new BigDecimal("10000");
    var other = new Product();
    other.name = "Móc khóa";
    other.price = new BigDecimal("20000");
    var combo = new Combo();
    combo.name = "Combo";
    combo.price = new BigDecimal("30000");
    var a = new ComboItem();
    a.productId = product.id;
    a.quantity = 2;
    var b = new ComboItem();
    b.productId = other.id;
    b.quantity = 1;
    when(catalog.product(product.id, true)).thenReturn(product);
    when(catalog.product(other.id, true)).thenReturn(other);
    when(catalog.combo(combo.id, true)).thenReturn(combo);
    when(catalog.components(combo.id)).thenReturn(List.of(a, b));
    var service =
        new CheckoutService(
            db,
            shop,
            mock(ShopService.class),
            catalog,
            mock(InventoryService.class),
            mock(IdempotencyService.class),
            mock(Crypto.class),
            mock(AuditService.class),
            Clock.systemUTC(),
            24,
            90);
    var resolved =
        service.resolve(
            List.of(
                new CheckoutDtos.CartLine("PRODUCT", product.id, 3),
                new CheckoutDtos.CartLine("COMBO", combo.id, 2)));
    assertEquals(7, resolved.demand().get(product.id));
    assertEquals(2, resolved.demand().get(other.id));
    assertEquals(new BigDecimal("90000"), resolved.total());
    String old = resolved.fingerprint();
    product.version++;
    assertNotEquals(
        old,
        service
            .resolve(
                List.of(
                    new CheckoutDtos.CartLine("PRODUCT", product.id, 3),
                    new CheckoutDtos.CartLine("COMBO", combo.id, 2)))
            .fingerprint());
  }
}
