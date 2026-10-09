package vn.schoolshop.inventory;

import jakarta.persistence.*;
import java.util.UUID;

@Entity(name = "Movement")
@Table(name = "inventory_movements", schema = "shop")
public class Movement extends vn.schoolshop.common.BaseEntity {
  @Column(name = "product_id", nullable = false)
  public UUID productId;

  @Column(name = "order_id", nullable = true)
  public UUID orderId;

  @Column(name = "kind", nullable = false)
  public String kind;

  @Column(name = "delta_on_hand", nullable = false)
  public int deltaOnHand;

  @Column(name = "delta_reserved", nullable = false)
  public int deltaReserved;

  @Column(name = "reason", nullable = true)
  public String reason;

  @Column(name = "actor_id", nullable = true)
  public UUID actorId;
}
