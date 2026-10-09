package vn.schoolshop.identity;

import java.time.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import vn.schoolshop.common.ApiException;
import vn.schoolshop.infrastructure.Crypto;

@Service
public class GuestSessions {
  private final Crypto crypto;
  private final Clock clock;

  public GuestSessions(Crypto crypto, Clock clock) {
    this.crypto = crypto;
    this.clock = clock;
  }

  public String checkout() {
    return crypto.sign(
        "checkout|"
            + UUID.randomUUID()
            + "|"
            + clock.instant().plus(Duration.ofDays(2)).getEpochSecond());
  }

  public String order(UUID id) {
    return crypto.sign(
        "order|" + id + "|" + clock.instant().plus(Duration.ofDays(7)).getEpochSecond());
  }

  public Actor checkoutActor(String cookie) {
    return parse(cookie, "checkout");
  }

  public Actor orderActor(String cookie) {
    return parse(cookie, "order");
  }

  private Actor parse(String cookie, String kind) {
    if (cookie == null) throw new ApiException(401, "SESSION_REQUIRED", "Cần phiên truy cập.");
    try {
      String[] p = crypto.verify(cookie).split("\\|");
      ApiException.check(
          p.length == 3
              && p[0].equals(kind)
              && Long.parseLong(p[2]) > clock.instant().getEpochSecond(),
          401,
          "SESSION_EXPIRED",
          "Phiên đã hết hạn.");
      UUID id = UUID.fromString(p[1]);
      return new Actor(null, "GUEST", "guest:" + kind + ":" + id, kind.equals("order") ? id : null);
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(401, "INVALID_SESSION", "Phiên truy cập không hợp lệ.");
    }
  }
}
