package vn.schoolshop.identity;

import java.util.UUID;

public record Actor(UUID id, String type, String scope, UUID guestOrderId) {
  public static Actor system() {
    return new Actor(null, "SYSTEM", "system", null);
  }
}
