package vn.schoolshop.identity;

import static vn.schoolshop.common.ApiException.check;
import static vn.schoolshop.common.Views.map;

import java.util.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.common.*;
import vn.schoolshop.shop.ShopAccess;

@Service
public class ProfileService {
  private final DomainRepository db;
  private final ShopAccess shop;

  public ProfileService(DomainRepository db, ShopAccess shop) {
    this.db = db;
    this.shop = shop;
  }

  @Transactional
  public Actor actor(Jwt jwt) {
    if (jwt == null) throw new ApiException(401, "AUTH_REQUIRED", "Vui lòng đăng nhập.");
    UUID sub;
    try {
      sub = UUID.fromString(jwt.getSubject());
    } catch (Exception e) {
      throw new ApiException(401, "INVALID_TOKEN", "Token không hợp lệ.");
    }
    shop.lock();
    var list = db.list(Profile.class, "e.authUserId=:sub", Map.of("sub", sub));
    Profile p;
    if (list.isEmpty()) {
      p = new Profile();
      p.authUserId = sub;
      p.email = jwt.getClaimAsString("email");
      p.role = "CUSTOMER";
      p.active = true;
      db.add(p);
    } else p = list.getFirst();
    check(p.active, 403, "ACCOUNT_DISABLED", "Tài khoản đã bị vô hiệu hóa.");
    return new Actor(p.id, p.role, "account:" + p.id, null);
  }

  public void seller(Actor actor) {
    check(
        actor != null && "SELLER".equals(actor.type()),
        403,
        "SELLER_REQUIRED",
        "Chỉ người bán được phép thực hiện.");
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(Actor actor) {
    return view(db.find(Profile.class, actor.id()));
  }

  @Transactional
  public Map<String, Object> patch(Actor actor, ProfilePatch input) {
    shop.lock();
    var p = db.find(Profile.class, actor.id());
    check(input.expectedVersion() != null, 400, "VERSION_REQUIRED", "Cần expectedVersion.");
    ApiException.version(p.version, input.expectedVersion());
    if (input.fullName() != null) p.fullName = input.fullName().trim();
    if (input.phone() != null) p.phone = Phone.normalize(input.phone());
    db.flush();
    return view(p);
  }

  private Map<String, Object> view(Profile p) {
    return map(
        "id",
        p.id,
        "fullName",
        p.fullName,
        "phone",
        p.phone,
        "email",
        p.email,
        "role",
        p.role,
        "active",
        p.active,
        "authUserId",
        p.authUserId,
        "version",
        p.version);
  }

  public record ProfilePatch(
      @jakarta.validation.constraints.Size(min = 2, max = 100) String fullName,
      @jakarta.validation.constraints.Size(max = 30) String phone,
      @jakarta.validation.constraints.PositiveOrZero Long expectedVersion) {}
}
