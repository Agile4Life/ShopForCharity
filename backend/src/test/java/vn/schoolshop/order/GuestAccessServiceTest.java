package vn.schoolshop.order;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import vn.schoolshop.common.*;
import vn.schoolshop.infrastructure.Crypto;
import vn.schoolshop.shop.*;

class GuestAccessServiceTest {
  final DomainRepository db = mock(DomainRepository.class);
  final UUID shopId = UUID.randomUUID();
  final ShopAccess shop = new ShopAccess(shopId, mock(ShopRepository.class));
  final Instant now = Instant.parse("2026-10-09T12:00:00Z");
  final GuestAccessService service = new GuestAccessService(db, shop, Clock.fixed(now, ZoneOffset.UTC));
  Order order;

  @BeforeEach
  void setup() {
    order = new Order();
    order.orderCode = "ORD-TEST";
    order.guestTokenHash = Crypto.hash("secret-token");
    order.guestTokenExpiresAt = now.plusSeconds(60);
    when(db.list(eq(Order.class), anyString(), anyMap())).thenReturn(List.of(order));
  }

  @Test
  void validGuestCredentialsReturnOnlyMatchingOrderId() {
    assertEquals(order.id, service.verify(new CheckoutDtos.AccessInput("ORD-TEST", "secret-token")));
    verify(db).list(eq(Order.class), anyString(), eq(Map.of("shop", shopId, "code", "ORD-TEST")));
  }

  @ParameterizedTest
  @ValueSource(strings = {"wrong-token", "expired", "expiry-boundary", "customer-order", "missing", "no-hash", "no-expiry"})
  void invalidCredentialsUseSameUnauthorizedResponse(String mode) {
    String token = "secret-token";
    switch (mode) {
      case "wrong-token" -> token = "wrong-token";
      case "expired" -> order.guestTokenExpiresAt = now.minusSeconds(1);
      case "expiry-boundary" -> order.guestTokenExpiresAt = now;
      case "customer-order" -> order.customerId = UUID.randomUUID();
      case "missing" -> when(db.list(eq(Order.class), anyString(), anyMap())).thenReturn(List.of());
      case "no-hash" -> order.guestTokenHash = null;
      case "no-expiry" -> order.guestTokenExpiresAt = null;
    }
    final String supplied = token;
    var error = assertThrows(ApiException.class, () -> service.verify(new CheckoutDtos.AccessInput("ORD-TEST", supplied)));
    assertEquals(401, error.status);
    assertEquals("INVALID_GUEST_ACCESS", error.code);
  }
}
