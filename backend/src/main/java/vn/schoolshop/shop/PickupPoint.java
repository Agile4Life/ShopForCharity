package vn.schoolshop.shop;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="PickupPoint") @Table(name="pickup_points", schema="shop")
public class PickupPoint extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="name", nullable=false) public String name;
    @Column(name="instructions", nullable=true) public String instructions;
    @Column(name="active", nullable=false) public boolean active;
}
