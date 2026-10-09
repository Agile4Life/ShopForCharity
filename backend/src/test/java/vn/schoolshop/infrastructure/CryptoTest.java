package vn.schoolshop.infrastructure;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import vn.schoolshop.common.ApiException;

class CryptoTest {
  static String key(int value) {
    byte[] key = new byte[32];
    Arrays.fill(key, (byte) value);
    return Base64.getEncoder().encodeToString(key);
  }

  @Test
  void signedPayloadCannotBeAltered() {
    var c = new Crypto(key(1), key(2));
    String token = c.sign("order|id|100");
    assertEquals("order|id|100", c.verify(token));
    assertThrows(ApiException.class, () -> c.verify("X" + token.substring(1)));
  }

  @Test
  void credentialEncryptionUsesFreshNonceAndRejectsTampering() {
    var c = new Crypto(key(1), key(2));
    String a = c.encrypt("guest-secret"), b = c.encrypt("guest-secret");
    assertNotEquals(a, b);
    assertFalse(a.contains("guest-secret"));
    assertEquals("guest-secret", c.decrypt(a));
    assertThrows(IllegalStateException.class, () -> c.decrypt("X" + a.substring(1)));
  }

  @Test
  void keyReuseIsRejected() {
    assertThrows(IllegalArgumentException.class, () -> new Crypto(key(1), key(1)));
  }

  @Test
  void guestTokensHave256BitsAndDistinctHashes() {
    var c = new Crypto(key(1), key(2));
    String a = c.token(), b = c.token();
    assertEquals(32, Base64.getUrlDecoder().decode(a).length);
    assertNotEquals(a, b);
    assertNotEquals(Crypto.hash(a), Crypto.hash(b));
  }
}
