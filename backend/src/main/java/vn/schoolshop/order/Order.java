package vn.schoolshop.order;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="Order") @Table(name="orders", schema="shop")
public class Order extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="order_code", nullable=false) public String orderCode;
    @Column(name="customer_id", nullable=true) public UUID customerId;
    @Column(name="buyer_name", nullable=false) public String buyerName;
    @Column(name="buyer_phone", nullable=false) public String buyerPhone;
    @Column(name="buyer_email", nullable=false) public String buyerEmail;
    @Column(name="buyer_class", nullable=true) public String buyerClass;
    @Column(name="pickup_point_id", nullable=false) public UUID pickupPointId;
    @Column(name="pickup_name", nullable=false) public String pickupName;
    @Column(name="pickup_instructions", nullable=true) public String pickupInstructions;
    @Column(name="requested_at", nullable=true) public Instant requestedAt;
    @Column(name="confirmed_at", nullable=true) public Instant confirmedAt;
    @Column(name="note", nullable=true) public String note;
    @Column(name="payment_method", nullable=false) public String paymentMethod;
    @Column(name="payment_status", nullable=false) public String paymentStatus;
    @Column(name="status", nullable=false) public String status;
    @Column(name="subtotal", nullable=false, precision=14, scale=0) public BigDecimal subtotal;
    @Column(name="total", nullable=false, precision=14, scale=0) public BigDecimal total;
    @Column(name="received_amount", nullable=false, precision=14, scale=0) public BigDecimal receivedAmount;
    @Column(name="payment_settings_version_id", nullable=true) public UUID paymentSettingsVersionId;
    @Column(name="guest_token_hash", nullable=true) public String guestTokenHash;
    @Column(name="guest_token_expires_at", nullable=true) public Instant guestTokenExpiresAt;
    @Column(name="reservation_expires_at", nullable=false) public Instant reservationExpiresAt;
}
