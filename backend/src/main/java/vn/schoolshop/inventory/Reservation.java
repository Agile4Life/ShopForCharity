package vn.schoolshop.inventory;

import jakarta.persistence.*;
import java.util.UUID;

@Entity(name = "Reservation")
@Table(name = "stock_reservations", schema = "shop")
public class Reservation extends vn.schoolshop.common.BaseEntity {
  @Column(name = "order_id", nullable = false)
  public UUID orderId;

  @Column(name = "product_id", nullable = false)
  public UUID productId;

  @Column(name = "quantity", nullable = false)
  public int quantity;

  @Column(name = "state", nullable = false)
  public String state;
}
