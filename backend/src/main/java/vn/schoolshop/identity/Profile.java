package vn.schoolshop.identity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity(name = "Profile")
@Table(name = "profiles", schema = "shop")
public class Profile extends vn.schoolshop.common.BaseEntity {
  @Column(name = "auth_user_id", nullable = false)
  public UUID authUserId;

  @Column(name = "full_name", nullable = true)
  public String fullName;

  @Column(name = "phone", nullable = true)
  public String phone;

  @Column(name = "email", nullable = true)
  public String email;

  @Column(name = "role", nullable = false)
  public String role;

  @Column(name = "active", nullable = false)
  public boolean active;
}
