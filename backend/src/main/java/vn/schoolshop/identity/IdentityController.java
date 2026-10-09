package vn.schoolshop.identity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import jakarta.validation.Valid;
@RestController @RequestMapping("/api/v1/me")
public class IdentityController {
    private final ProfileService profiles;
    public IdentityController(ProfileService profiles){this.profiles=profiles;}
    @GetMapping public Object me(@AuthenticationPrincipal Jwt jwt){return profiles.get(profiles.actor(jwt));}
    @PatchMapping public Object patch(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ProfileService.ProfilePatch input){return profiles.patch(profiles.actor(jwt),input);}
}
