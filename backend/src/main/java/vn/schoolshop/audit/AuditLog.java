package vn.schoolshop.audit;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.Instant;
import java.math.BigDecimal;
@Entity(name="AuditLog") @Table(name="audit_logs", schema="shop")
public class AuditLog extends vn.schoolshop.common.BaseEntity {
    @Column(name="shop_id", nullable=false) public UUID shopId;
    @Column(name="actor_id", nullable=true) public UUID actorId;
    @Column(name="actor_type", nullable=false) public String actorType;
    @Column(name="action", nullable=false) public String action;
    @Column(name="entity_type", nullable=false) public String entityType;
    @Column(name="entity_id", nullable=false) public UUID entityId;
    @Column(name="safe_before", nullable=true) public String safeBefore;
    @Column(name="safe_after", nullable=true) public String safeAfter;
    @Column(name="request_id", nullable=false) public String requestId;
}
