package vn.schoolshop.common;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@MappedSuperclass
public abstract class BaseEntity {
    @Id public UUID id = UUID.randomUUID();
    @Version public long version;
    @Column(nullable=false) public Instant createdAt;
    @Column(nullable=false) public Instant updatedAt;
    @PrePersist public void insertTime() { if (createdAt == null) createdAt = Instant.now(); updatedAt = createdAt; }
    @PreUpdate public void updateTime() { updatedAt = Instant.now(); }
}
