package vn.schoolshop.catalog;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="ComboItem") @Table(name="combo_items", schema="shop")
public class ComboItem extends vn.schoolshop.common.BaseEntity {
    @Column(name="combo_id", nullable=false) public UUID comboId;
    @Column(name="product_id", nullable=false) public UUID productId;
    @Column(name="quantity", nullable=false) public int quantity;
}
