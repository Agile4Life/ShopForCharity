package vn.schoolshop.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import vn.schoolshop.common.*;
import vn.schoolshop.shop.ShopAccess;

class ProfileServiceTest {
  Jwt token(UUID subject) {
    return Jwt.withTokenValue("test")
        .header("alg", "RS256")
        .subject(subject.toString())
        .issuedAt(Instant.now())
        .expiresAt(Instant.now().plusSeconds(300))
        .claim("email", "student@example.com")
        .claim("role", "authenticated")
        .claim("user_metadata", Map.of("role", "SELLER"))
        .build();
  }

  @Test
  void editableMetadataCannotPromoteNewAccount() {
    var db = mock(DomainRepository.class);
    when(db.list(eq(Profile.class), anyString(), anyMap())).thenReturn(List.of());
    var service = new ProfileService(db, mock(ShopAccess.class));
    var actor = service.actor(token(UUID.randomUUID()));
    assertEquals("CUSTOMER", actor.type());
    var saved = org.mockito.ArgumentCaptor.forClass(Profile.class);
    verify(db).add(saved.capture());
    assertEquals("CUSTOMER", saved.getValue().role);
    assertThrows(ApiException.class, () -> service.seller(actor));
  }

  @Test
  void disabledProfileIsRejectedEvenWhenJwtIsValid() {
    var db = mock(DomainRepository.class);
    var profile = new Profile();
    profile.active = false;
    profile.role = "SELLER";
    when(db.list(eq(Profile.class), anyString(), anyMap())).thenReturn(List.of(profile));
    var service = new ProfileService(db, mock(ShopAccess.class));
    assertEquals(
        "ACCOUNT_DISABLED",
        assertThrows(ApiException.class, () -> service.actor(token(UUID.randomUUID()))).code);
  }
}
