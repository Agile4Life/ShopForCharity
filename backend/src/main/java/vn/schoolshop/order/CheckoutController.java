package vn.schoolshop.order;

import static vn.schoolshop.order.CheckoutDtos.*;

import jakarta.validation.Valid;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;

@RestController
@RequestMapping("/api/v1")
public class CheckoutController {
  private final CheckoutService service;
  private final ProfileService profiles;
  private final GuestSessions sessions;
  private final RequestFilter limits;
  private final boolean secure;

  public CheckoutController(
      CheckoutService service,
      ProfileService profiles,
      GuestSessions sessions,
      RequestFilter limits,
      @Value("${app.cookie-secure}") boolean secure) {
    this.service = service;
    this.profiles = profiles;
    this.sessions = sessions;
    this.limits = limits;
    this.secure = secure;
  }

  public ResponseCookie cookie(String name, String token, Duration age) {
    return ResponseCookie.from(name, token)
        .httpOnly(true)
        .secure(secure)
        .sameSite("Lax")
        .path("/api/v1")
        .maxAge(age)
        .build();
  }

  @PostMapping("/checkout/session")
  public ResponseEntity<?> session(
      @CookieValue(name = "checkout_session", required = false) String existing) {
    String token = existing;
    try {
      sessions.checkoutActor(token);
    } catch (ApiException e) {
      token = sessions.checkout();
    }
    var actor = sessions.checkoutActor(token);
    return ResponseEntity.ok()
        .header(
            HttpHeaders.SET_COOKIE,
            cookie("checkout_session", token, Duration.ofDays(2)).toString())
        .body(Map.of("sessionId", actor.scope().substring("guest:checkout:".length())));
  }

  @PostMapping("/checkout/quote")
  public Object quote(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody QuoteInput input) {
    if (jwt != null) profiles.actor(jwt);
    return service.quote(input);
  }

  @PostMapping("/orders")
  public ResponseEntity<?> create(
      @AuthenticationPrincipal Jwt jwt,
      @CookieValue(name = "checkout_session", required = false) String cookie,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody CreateInput input) {
    Actor actor = jwt == null ? sessions.checkoutActor(cookie) : profiles.actor(jwt);
    ApiException.check(
        limits.allow("create:" + actor.scope(), 5), 429, "RATE_LIMITED", "Vui lòng thử lại sau.");
    var result = service.create(actor, key, input);
    var builder = ResponseEntity.status(201);
    if (actor.id() == null)
      builder.header(
          HttpHeaders.SET_COOKIE,
          cookie(
                  "guest_order",
                  sessions.order(UUID.fromString(result.get("orderId").toString())),
                  Duration.ofDays(7))
              .toString());
    return builder.body(result);
  }
}
