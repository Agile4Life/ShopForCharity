package vn.schoolshop.order;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.schoolshop.common.*;
import vn.schoolshop.infrastructure.Crypto;
import vn.schoolshop.shop.ShopAccess;

@Service
public class GuestAccessService {
  private final DomainRepository db;
  private final ShopAccess shop;
  private final Clock clock;

  public GuestAccessService(DomainRepository db, ShopAccess shop, Clock clock) {
    this.db = db;
    this.shop = shop;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public UUID verify(CheckoutDtos.AccessInput input) {
    var list =
        db.list(
            Order.class,
            "e.shopId=:shop and e.orderCode=:code",
            Map.of("shop", shop.id, "code", input.orderCode()));
    String actual =
        list.isEmpty() || list.getFirst().guestTokenHash == null
            ? "0".repeat(64)
            : list.getFirst().guestTokenHash;
    boolean match =
        MessageDigest.isEqual(
            actual.getBytes(StandardCharsets.US_ASCII),
            Crypto.hash(input.guestToken()).getBytes(StandardCharsets.US_ASCII));
    if (!match
        || list.isEmpty()
        || list.getFirst().customerId != null
        || list.getFirst().guestTokenExpiresAt == null
        || !list.getFirst().guestTokenExpiresAt.isAfter(clock.instant()))
      throw new ApiException(401, "INVALID_GUEST_ACCESS", "Mã đơn hoặc khóa xem đơn không hợp lệ.");
    return list.getFirst().id;
  }
}
