package vn.schoolshop.infrastructure;

import jakarta.persistence.*;
import java.time.Instant;

@Entity(name = "IdempotencyRecord")
@Table(name = "idempotency_keys", schema = "shop")
public class IdempotencyRecord extends vn.schoolshop.common.BaseEntity {
  @Column(name = "caller_scope_hash", nullable = false)
  public String callerScopeHash;

  @Column(name = "key", nullable = false)
  public String key;

  @Column(name = "request_hash", nullable = false)
  public String requestHash;

  @Column(name = "encrypted_response", nullable = false)
  public String encryptedResponse;

  @Column(name = "expires_at", nullable = false)
  public Instant expiresAt;
}
