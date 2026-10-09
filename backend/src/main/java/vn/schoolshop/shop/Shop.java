package vn.schoolshop.shop;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="Shop") @Table(name="shops", schema="shop")
public class Shop extends vn.schoolshop.common.BaseEntity {
    @Column(name="name", nullable=false) public String name;
    @Column(name="contact_phone", nullable=true) public String contactPhone;
    @Column(name="contact_email", nullable=true) public String contactEmail;
    @Column(name="accepting_orders", nullable=false) public boolean acceptingOrders;
    @Column(name="payment_settings_version_id", nullable=true) public UUID paymentSettingsVersionId;
}
