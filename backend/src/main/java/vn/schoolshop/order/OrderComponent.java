package vn.schoolshop.order;

import jakarta.persistence.*;
import java.util.UUID;

@Entity(name = "OrderComponent")
@Table(name = "order_item_components", schema = "shop")
public class OrderComponent extends vn.schoolshop.common.BaseEntity {
  @Column(name = "order_item_id", nullable = false)
  public UUID orderItemId;

  @Column(name = "product_id", nullable = false)
  public UUID productId;

  @Column(name = "name_snapshot", nullable = false)
  public String nameSnapshot;

  @Column(name = "units_per_item", nullable = false)
  public int unitsPerItem;
}
