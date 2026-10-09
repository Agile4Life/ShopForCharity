package vn.schoolshop.identity;

import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import vn.schoolshop.common.ApiException;
import vn.schoolshop.infrastructure.Crypto;

class GuestSessionsTest {
  private Crypto crypto() {
    byte[] a = new byte[32], b = new byte[32];
    Arrays.fill(a, (byte) 1);
    Arrays.fill(b, (byte) 2);
    return new Crypto(Base64.getEncoder().encodeToString(a), Base64.getEncoder().encodeToString(b));
  }

  @Test
  void orderCookieDoesNotGrantCheckoutScope() {
    var sessions = new GuestSessions(crypto(), Clock.systemUTC());
    var id = UUID.randomUUID();
    String cookie = sessions.order(id);
    assertEquals(id, sessions.orderActor(cookie).guestOrderId());
    assertThrows(ApiException.class, () -> sessions.checkoutActor(cookie));
  }

  @Test
  void expiredCheckoutIsRejected() {
    var start = Instant.parse("2026-10-09T00:00:00Z");
    var c = crypto();
    var first = new GuestSessions(c, Clock.fixed(start, ZoneOffset.UTC));
    String cookie = first.checkout();
    var later = new GuestSessions(c, Clock.fixed(start.plus(Duration.ofDays(3)), ZoneOffset.UTC));
    assertThrows(ApiException.class, () -> later.checkoutActor(cookie));
  }

  @Test
  void VietnamesePhoneNormalization() {
    assertEquals("0901234567", Phone.normalize("+84 901-234-567"));
    assertThrows(ApiException.class, () -> Phone.normalize("123"));
  }
}
