package vn.schoolshop.infrastructure;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="Asset") @Table(name="assets", schema="shop")
public class Asset extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="bucket", nullable=false) public String bucket;
    @Column(name="object_path", nullable=false) public String objectPath;
    @Column(name="thumbnail_path", nullable=true) public String thumbnailPath;
    @Column(name="type", nullable=false) public String type;
    @Column(name="mime", nullable=false) public String mime;
    @Column(name="size", nullable=false) public long size;
    @Column(name="created_by", nullable=true) public UUID createdBy;
}
