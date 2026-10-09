package vn.schoolshop.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.Actor;

class IdempotencyServiceTest {
  @Test
  void encryptedRetryReturnsSameCredentialWithoutCallingOperation() {
    var db = mock(DomainRepository.class);
    byte[] a = new byte[32], b = new byte[32];
    Arrays.fill(a, (byte) 1);
    Arrays.fill(b, (byte) 2);
    var crypto =
        new Crypto(Base64.getEncoder().encodeToString(a), Base64.getEncoder().encodeToString(b));
    var clock = Clock.systemUTC();
    var mapper = new ObjectMapper().findAndRegisterModules();
    var service = new IdempotencyService(db, crypto, mapper, clock);
    var actor = new Actor(null, "GUEST", "checkout:abc", null);
    String key = UUID.randomUUID().toString();
    var request = Map.of("amount", 100);
    when(db.list(eq(IdempotencyRecord.class), anyString(), anyMap())).thenReturn(List.of());
    var first =
        service.run(
            actor,
            "create",
            key,
            request,
            () -> Views.map("guestAccessToken", "secret", "orderId", "same-order"));
    var captor = org.mockito.ArgumentCaptor.forClass(IdempotencyRecord.class);
    verify(db).add(captor.capture());
    var stored = captor.getValue();
    assertFalse(stored.encryptedResponse.contains("secret"));
    when(db.list(eq(IdempotencyRecord.class), anyString(), anyMap())).thenReturn(List.of(stored));
    var second =
        service.run(
            actor,
            "create",
            key,
            request,
            () -> {
              fail("Retry executed business operation");
              return null;
            });
    assertEquals(first, second);
    var error =
        assertThrows(
            ApiException.class,
            () -> service.run(actor, "create", key, Map.of("amount", 200), () -> null));
    assertEquals("IDEMPOTENCY_MISMATCH", error.code);
  }
}
