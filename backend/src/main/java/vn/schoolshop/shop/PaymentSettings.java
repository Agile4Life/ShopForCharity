package vn.schoolshop.shop;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="PaymentSettings") @Table(name="payment_settings_versions", schema="shop")
public class PaymentSettings extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="bank_name", nullable=false) public String bankName;
    @Column(name="account_number", nullable=false) public String accountNumber;
    @Column(name="account_holder", nullable=false) public String accountHolder;
    @Column(name="qr_asset_id", nullable=false) public UUID qrAssetId;
    @Column(name="created_by", nullable=true) public UUID createdBy;
}
