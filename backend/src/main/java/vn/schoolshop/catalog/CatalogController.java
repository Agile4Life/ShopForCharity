package vn.schoolshop.catalog;

import static vn.schoolshop.catalog.CatalogDtos.*;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.schoolshop.identity.ProfileService;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {
  private final CatalogService catalog;
  private final ProfileService profiles;

  public CatalogController(CatalogService catalog, ProfileService profiles) {
    this.catalog = catalog;
    this.profiles = profiles;
  }

  @GetMapping("/health")
  public Object health() {
    return java.util.Map.of("status", "UP");
  }

  @GetMapping("/categories")
  public Object categories() {
    return catalog.categories();
  }

  @GetMapping("/{kind:products|combos}")
  public Object list(
      @PathVariable String kind,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String category,
      @RequestParam(defaultValue = "newest") String sort,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return catalog.list(kind.equals("combos"), false, q, category, sort, page, size, null);
  }

  @GetMapping("/{kind:products|combos}/{id}")
  public Object detail(@PathVariable String kind, @PathVariable String id) {
    return catalog.publicDetail(kind.equals("combos"), id);
  }

  @GetMapping("/seller/{kind:products|combos}")
  public Object sellerList(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable String kind,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String category,
      @RequestParam(defaultValue = "newest") String sort,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return catalog.list(
        kind.equals("combos"), true, q, category, sort, page, size, profiles.actor(jwt));
  }

  @GetMapping("/seller/{kind:products|combos}/{id}")
  public Object sellerDetail(
      @AuthenticationPrincipal Jwt jwt, @PathVariable String kind, @PathVariable UUID id) {
    return catalog.detail(kind.equals("combos"), id, true, profiles.actor(jwt));
  }

  @PostMapping("/seller/products")
  public Object createProduct(
      @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProductInput input) {
    return catalog.saveProduct(profiles.actor(jwt), null, input);
  }

  @PatchMapping("/seller/products/{id}")
  public Object updateProduct(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @Valid @RequestBody ProductInput input) {
    return catalog.saveProduct(profiles.actor(jwt), id, input);
  }

  @PostMapping("/seller/combos")
  public Object createCombo(
      @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ComboInput input) {
    return catalog.saveCombo(profiles.actor(jwt), null, input);
  }

  @PatchMapping("/seller/combos/{id}")
  public Object updateCombo(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @Valid @RequestBody ComboInput input) {
    return catalog.saveCombo(profiles.actor(jwt), id, input);
  }

  @PostMapping("/seller/{kind:products|combos}/{id}/{action:activate|archive}")
  public Object status(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable String kind,
      @PathVariable UUID id,
      @PathVariable String action,
      @Valid @RequestBody VersionInput input) {
    return catalog.status(
        profiles.actor(jwt),
        kind.equals("combos"),
        id,
        action.equals("activate") ? "ACTIVE" : "ARCHIVED",
        input.expectedVersion());
  }
}
