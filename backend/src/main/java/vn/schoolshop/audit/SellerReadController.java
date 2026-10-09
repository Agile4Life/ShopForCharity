package vn.schoolshop.audit;

import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.schoolshop.identity.ProfileService;

@RestController
@RequestMapping("/api/v1/seller")
public class SellerReadController {
  private final SellerReadService service;
  private final ProfileService profiles;

  public SellerReadController(SellerReadService service, ProfileService profiles) {
    this.service = service;
    this.profiles = profiles;
  }

  @GetMapping("/dashboard")
  public Object dashboard(@AuthenticationPrincipal Jwt jwt) {
    return service.dashboard(profiles.actor(jwt));
  }

  @GetMapping("/notifications")
  public Object notifications(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.notifications(profiles.actor(jwt), page, size);
  }

  @PostMapping("/notifications/{id}/read")
  public Object read(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return service.read(profiles.actor(jwt), id);
  }

  @GetMapping("/audit-logs")
  public Object audit(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(required = false) String action,
      @RequestParam(required = false) String entityType,
      @RequestParam(required = false) String date,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.audit(profiles.actor(jwt), action, entityType, date, page, size);
  }
}
