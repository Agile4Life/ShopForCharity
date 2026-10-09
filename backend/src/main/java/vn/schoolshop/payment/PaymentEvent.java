package vn.schoolshop.payment;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity(name = "PaymentEvent")
@Table(name = "payment_events", schema = "shop")
public class PaymentEvent extends vn.schoolshop.common.BaseEntity {
  @Column(name = "shop_id", nullable = false)
  public UUID shopId;

  @Column(name = "order_id", nullable = false)
  public UUID orderId;

  @Column(name = "type", nullable = false)
  public String type;

  @Column(name = "from_status", nullable = false)
  public String fromStatus;

  @Column(name = "to_status", nullable = false)
  public String toStatus;

  @Column(name = "amount", nullable = true, precision = 14, scale = 0)
  public BigDecimal amount;

  @Column(name = "bank_reference", nullable = true)
  public String bankReference;

  @Column(name = "actor_id", nullable = true)
  public UUID actorId;

  @Column(name = "note", nullable = true)
  public String note;

  @Column(name = "occurred_at", nullable = true)
  public Instant occurredAt;
}
