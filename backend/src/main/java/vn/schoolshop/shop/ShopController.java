package vn.schoolshop.shop;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import jakarta.validation.Valid;
import java.util.UUID;
import vn.schoolshop.identity.ProfileService;
@RestController @RequestMapping("/api/v1")
public class ShopController {
    private final ShopService service;private final ProfileService profiles;
    public ShopController(ShopService service,ProfileService profiles){this.service=service;this.profiles=profiles;}
    @GetMapping("/shop") public Object shop(){return service.get(false,null);}
    @GetMapping("/seller/shop-settings") public Object settings(@AuthenticationPrincipal Jwt jwt){return service.get(true,profiles.actor(jwt));}
    @PatchMapping("/seller/shop-settings") public Object settings(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ShopService.SettingsInput input){return service.update(profiles.actor(jwt),input);}
    @GetMapping("/seller/pickup-points") public Object points(@AuthenticationPrincipal Jwt jwt){return service.get(true,profiles.actor(jwt)).get("pickupPoints");}
    @PostMapping("/seller/pickup-points") public Object point(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ShopService.PointInput input){return service.savePoint(profiles.actor(jwt),null,input);}
    @PatchMapping("/seller/pickup-points/{id}") public Object point(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ShopService.PointInput input){return service.savePoint(profiles.actor(jwt),id,input);}
}
