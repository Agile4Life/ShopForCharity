package vn.schoolshop.order;

import static vn.schoolshop.order.CheckoutDtos.*;

import jakarta.validation.Valid;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.payment.PaymentService;

@RestController
@RequestMapping("/api/v1")
public class OrderController {
  private final OrderService orders;
  private final PaymentService payments;
  private final ProfileService profiles;
  private final GuestSessions sessions;
  private final GuestAccessService guestAccess;
  private final boolean secure;

  public OrderController(
      OrderService orders,
      PaymentService payments,
      ProfileService profiles,
      GuestSessions sessions,
      GuestAccessService guestAccess,
      @Value("${app.cookie-secure}") boolean secure) {
    this.orders = orders;
    this.payments = payments;
    this.profiles = profiles;
    this.sessions = sessions;
    this.guestAccess = guestAccess;
    this.secure = secure;
  }

  @GetMapping("/me/orders")
  public Object mine(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return orders.list(profiles.actor(jwt), false, null, null, null, null, page, size);
  }

  @GetMapping("/me/orders/{id}")
  public Object mine(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return orders.detail(profiles.actor(jwt), id, false);
  }

  @PostMapping("/me/orders/{id}/cancel")
  public Object cancel(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody ActionInput input) {
    return orders.action(profiles.actor(jwt), id, false, "cancel", key, input);
  }

  @PostMapping("/me/orders/{id}/payment-report")
  public Object report(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody PaymentService.Input input) {
    return payments.action(profiles.actor(jwt), id, false, "payment-report", key, input);
  }

  @GetMapping("/me/orders/{id}/payment-instructions")
  public Object instructions(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return payments.instructions(profiles.actor(jwt), id, false);
  }

  @PostMapping("/guest/orders/access")
  public ResponseEntity<?> guestAccess(@Valid @RequestBody AccessInput input) {
    UUID id = guestAccess.verify(input);
    return ResponseEntity.ok()
        .header(
            HttpHeaders.SET_COOKIE,
            ResponseCookie.from("guest_order", sessions.order(id))
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path("/api/v1")
                .maxAge(Duration.ofDays(7))
                .toString())
        .body(Map.of("success", true));
  }

  @GetMapping("/guest/orders/{code}")
  public Object guest(
      @CookieValue(name = "guest_order", required = false) String cookie,
      @PathVariable String code) {
    var actor = sessions.orderActor(cookie);
    return orders.detail(actor, orders.guestId(actor, code), false);
  }

  @PostMapping("/guest/orders/{code}/cancel")
  public Object cancelGuest(
      @CookieValue(name = "guest_order", required = false) String cookie,
      @PathVariable String code,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody ActionInput input) {
    var actor = sessions.orderActor(cookie);
    return orders.action(actor, orders.guestId(actor, code), false, "cancel", key, input);
  }

  @PostMapping("/guest/orders/{code}/payment-report")
  public Object reportGuest(
      @CookieValue(name = "guest_order", required = false) String cookie,
      @PathVariable String code,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody PaymentService.Input input) {
    var actor = sessions.orderActor(cookie);
    return payments.action(actor, orders.guestId(actor, code), false, "payment-report", key, input);
  }

  @GetMapping("/guest/orders/{code}/payment-instructions")
  public Object guestInstructions(
      @CookieValue(name = "guest_order", required = false) String cookie,
      @PathVariable String code) {
    var actor = sessions.orderActor(cookie);
    return payments.instructions(actor, orders.guestId(actor, code), false);
  }

  @GetMapping("/seller/orders")
  public Object seller(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String paymentStatus,
      @RequestParam(required = false) String orderCode,
      @RequestParam(required = false) String date,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return orders.list(
        profiles.actor(jwt), true, status, paymentStatus, orderCode, date, page, size);
  }

  @GetMapping("/seller/orders/{id}")
  public Object sellerDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return orders.detail(profiles.actor(jwt), id, true);
  }

  @PostMapping("/seller/orders/{id}/contact-attempts")
  public Object contact(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody ContactInput input) {
    return orders.contact(profiles.actor(jwt), id, key, input);
  }

  @PostMapping("/seller/orders/{id}/{action:accept|reject|prepare|ready|complete|cancel}")
  public Object action(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @PathVariable String action,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody ActionInput input) {
    return orders.action(profiles.actor(jwt), id, true, action, key, input);
  }

  @PostMapping("/seller/orders/{id}/{action:confirm-payment|dismiss-payment-report|confirm-refund}")
  public Object payment(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @PathVariable String action,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody PaymentService.Input input) {
    return payments.action(profiles.actor(jwt), id, true, action, key, input);
  }

  @GetMapping("/seller/orders/{id}/payment-instructions")
  public Object sellerInstructions(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return payments.instructions(profiles.actor(jwt), id, true);
  }
}
