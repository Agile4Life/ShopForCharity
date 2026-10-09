package vn.schoolshop.infrastructure;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import vn.schoolshop.common.ApiException;
import vn.schoolshop.identity.*;

@RestController
@RequestMapping("/api/v1/seller/assets")
public class AssetController {
  private final AssetService assets;
  private final ProfileService profiles;
  private final RequestFilter limits;

  public AssetController(AssetService assets, ProfileService profiles, RequestFilter limits) {
    this.assets = assets;
    this.profiles = profiles;
    this.limits = limits;
  }

  @PostMapping(consumes = "multipart/form-data")
  public Object upload(
      @AuthenticationPrincipal Jwt jwt, @RequestParam MultipartFile file, @RequestParam String type)
      throws java.io.IOException {
    var actor = profiles.actor(jwt);
    profiles.seller(actor);
    ApiException.check(
        limits.allow("upload:" + actor.scope(), 20), 429, "RATE_LIMITED", "Vui lòng thử lại sau.");
    return assets.upload(
        actor, type, file.getBytes(), file.getContentType() == null ? "" : file.getContentType());
  }
}
