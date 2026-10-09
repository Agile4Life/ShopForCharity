package vn.schoolshop.order;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.Actor;
import vn.schoolshop.shop.ShopAccess;

class OrderAccessTest {
  @Test
  void customerCannotReadAnotherAccountOrder() {
    var access = new OrderAccess(mock(DomainRepository.class), mock(ShopAccess.class));
    var o = new Order();
    o.customerId = UUID.randomUUID();
    var e =
        assertThrows(
            ApiException.class,
            () -> access.authorize(o, new Actor(UUID.randomUUID(), "CUSTOMER", "a", null), false));
    assertEquals(404, e.status);
    assertDoesNotThrow(
        () -> access.authorize(o, new Actor(o.customerId, "CUSTOMER", "a", null), false));
  }

  @Test
  void guestCookieIsScopedToOneGuestOrder() {
    var access = new OrderAccess(mock(DomainRepository.class), mock(ShopAccess.class));
    var o = new Order();
    var actor = new Actor(null, "GUEST", "g", o.id);
    assertDoesNotThrow(() -> access.authorize(o, actor, false));
    assertThrows(ApiException.class, () -> access.authorize(new Order(), actor, false));
    o.customerId = UUID.randomUUID();
    assertThrows(ApiException.class, () -> access.authorize(o, actor, false));
  }

  @Test
  void sellerAuthorityRequiresExplicitManagementUseCase() {
    var access = new OrderAccess(mock(DomainRepository.class), mock(ShopAccess.class));
    var o = new Order();
    var actor = new Actor(UUID.randomUUID(), "SELLER", "s", null);
    assertThrows(ApiException.class, () -> access.authorize(o, actor, false));
    assertDoesNotThrow(() -> access.authorize(o, actor, true));
  }
}
