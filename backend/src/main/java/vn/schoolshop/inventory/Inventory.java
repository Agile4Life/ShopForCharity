package vn.schoolshop.inventory;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="Inventory") @Table(name="product_inventory", schema="shop")
public class Inventory extends vn.schoolshop.common.BaseEntity {
    @Column(name="stock_on_hand", nullable=false) public int stockOnHand;
    @Column(name="stock_reserved", nullable=false) public int stockReserved;
}
