package vn.schoolshop.order;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="ContactAttempt") @Table(name="order_contact_attempts", schema="shop")
public class ContactAttempt extends vn.schoolshop.common.BaseEntity {
    @Column(name="order_id", nullable=false) public UUID orderId;
    @Column(name="seller_id", nullable=false) public UUID sellerId;
    @Column(name="channel", nullable=false) public String channel;
    @Column(name="outcome", nullable=false) public String outcome;
    @Column(name="note", nullable=true) public String note;
}
