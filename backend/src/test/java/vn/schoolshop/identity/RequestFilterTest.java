package vn.schoolshop.identity;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

class RequestFilterTest {
  @Test
  void guestCookieActionRejectsForeignOriginEvenWithBearer() throws Exception {
    var filter =
        new RequestFilter("http://localhost:5173", new ObjectMapper().findAndRegisterModules());
    var req = new MockHttpServletRequest("POST", "/api/v1/guest/orders/ORD-TEST/cancel");
    req.addHeader("Origin", "https://attacker.example");
    req.addHeader("Authorization", "Bearer attacker-token");
    var res = new MockHttpServletResponse();
    var called = new AtomicBoolean();
    filter.doFilter(req, res, (r, s) -> called.set(true));
    assertEquals(403, res.getStatus());
    assertFalse(called.get());
    assertTrue(res.getContentAsString().contains("CSRF_ORIGIN_REJECTED"));
  }

  @Test
  void trustedOriginAllowsGuestSession() throws Exception {
    var filter =
        new RequestFilter("http://localhost:5173", new ObjectMapper().findAndRegisterModules());
    var req = new MockHttpServletRequest("POST", "/api/v1/checkout/session");
    req.addHeader("Origin", "http://localhost:5173");
    var called = new AtomicBoolean();
    filter.doFilter(req, new MockHttpServletResponse(), (r, s) -> called.set(true));
    assertTrue(called.get());
  }

  @Test
  void missingOriginRejectsCookieMutation() throws Exception {
    var filter =
        new RequestFilter("http://localhost:5173", new ObjectMapper().findAndRegisterModules());
    var res = new MockHttpServletResponse();
    filter.doFilter(new MockHttpServletRequest("POST", "/api/v1/orders"), res, (r, s) -> fail());
    assertEquals(403, res.getStatus());
  }
}
