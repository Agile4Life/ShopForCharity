package vn.schoolshop.audit;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="Notification") @Table(name="notifications", schema="shop")
public class Notification extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="recipient_profile_id", nullable=false) public UUID recipientProfileId;
    @Column(name="type", nullable=false) public String type;
    @Column(name="order_id", nullable=true) public UUID orderId;
    @Column(name="is_read", nullable=false) public boolean isRead;
}
