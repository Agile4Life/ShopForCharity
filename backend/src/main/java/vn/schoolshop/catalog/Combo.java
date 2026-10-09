package vn.schoolshop.catalog;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="Combo") @Table(name="combos", schema="shop")
public class Combo extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="slug", nullable=false) public String slug;
    @Column(name="name", nullable=false) public String name;
    @Column(name="description", nullable=true) public String description;
    @Column(name="price", nullable=false, precision=14, scale=0) public BigDecimal price;
    @Column(name="image_asset_id", nullable=true) public UUID imageAssetId;
    @Column(name="status", nullable=false) public String status;
}
