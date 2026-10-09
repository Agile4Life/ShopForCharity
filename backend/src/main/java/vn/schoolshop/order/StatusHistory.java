package vn.schoolshop.order;

import jakarta.persistence.*;
import java.util.UUID;

@Entity(name = "StatusHistory")
@Table(name = "order_status_history", schema = "shop")
public class StatusHistory extends vn.schoolshop.common.BaseEntity {
  @Column(name = "order_id", nullable = false)
  public UUID orderId;

  @Column(name = "from_status", nullable = true)
  public String fromStatus;

  @Column(name = "to_status", nullable = false)
  public String toStatus;

  @Column(name = "actor_id", nullable = true)
  public UUID actorId;

  @Column(name = "actor_type", nullable = false)
  public String actorType;

  @Column(name = "reason", nullable = true)
  public String reason;
}
