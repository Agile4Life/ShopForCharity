package vn.schoolshop.catalog;

import jakarta.persistence.*;
import java.util.UUID;

@Entity(name = "Category")
@Table(name = "categories", schema = "shop")
public class Category extends vn.schoolshop.common.BaseEntity {
  @Column(name = "shop_id", nullable = false)
  public UUID shopId;

  @Column(name = "code", nullable = false)
  public String code;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "active", nullable = false)
  public boolean active;
}
