package vn.schoolshop.order;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="OrderItem") @Table(name="order_items", schema="shop")
public class OrderItem extends vn.schoolshop.common.BaseEntity {
    @Column(name="order_id", nullable=false) public UUID orderId;
    @Column(name="kind", nullable=false) public String kind;
    @Column(name="product_id", nullable=true) public UUID productId;
    @Column(name="combo_id", nullable=true) public UUID comboId;
    @Column(name="name_snapshot", nullable=false) public String nameSnapshot;
    @Column(name="image_asset_id_snapshot", nullable=true) public UUID imageAssetIdSnapshot;
    @Column(name="unit_price", nullable=false, precision=14, scale=0) public BigDecimal unitPrice;
    @Column(name="quantity", nullable=false) public int quantity;
    @Column(name="line_total", nullable=false, precision=14, scale=0) public BigDecimal lineTotal;
}
