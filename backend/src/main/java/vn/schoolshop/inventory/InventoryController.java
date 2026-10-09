package vn.schoolshop.inventory;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.schoolshop.catalog.CatalogDtos;
import vn.schoolshop.identity.ProfileService;

@RestController
@RequestMapping("/api/v1/seller/products")
public class InventoryController {
  private final InventoryService inventory;
  private final ProfileService profiles;

  public InventoryController(InventoryService inventory, ProfileService profiles) {
    this.inventory = inventory;
    this.profiles = profiles;
  }

  @PostMapping("/{id}/stock-adjustments")
  public Object adjust(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key,
      @Valid @RequestBody CatalogDtos.StockInput input) {
    return inventory.adjust(profiles.actor(jwt), id, key, input);
  }
}
