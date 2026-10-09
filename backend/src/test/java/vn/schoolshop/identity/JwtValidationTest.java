package vn.schoolshop.identity;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.security.*;
import java.security.interfaces.*;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.*;
import org.springframework.security.oauth2.jwt.*;

class JwtValidationTest {
  private HttpServer server;
  private JwtEncoder encoder;
  private JwtDecoder decoder;

  @BeforeEach
  void setup() throws Exception {
    var generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    var pair = generator.generateKeyPair();
    var key =
        new com.nimbusds.jose.jwk.RSAKey.Builder((RSAPublicKey) pair.getPublic())
            .privateKey((RSAPrivateKey) pair.getPrivate())
            .keyID("test")
            .build();
    encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/jwks",
        exchange -> {
          byte[] body =
              new JWKSet(key.toPublicJWK())
                  .toString()
                  .getBytes(java.nio.charset.StandardCharsets.UTF_8);
          exchange.getResponseHeaders().add("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    decoder =
        new SecurityConfig()
            .jwtDecoder(
                "https://auth.example",
                "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks",
                "authenticated");
  }

  @AfterEach
  void stop() {
    if (server != null) server.stop(0);
  }

  String token(String issuer, String audience, Instant expires) {
    var claims =
        JwtClaimsSet.builder()
            .issuer(issuer)
            .subject(java.util.UUID.randomUUID().toString())
            .audience(List.of(audience))
            .issuedAt(Instant.now().minusSeconds(3600))
            .expiresAt(expires)
            .build();
    return encoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
  }

  @Test
  void validIssuerAudienceAndSignatureAreAccepted() {
    assertNotNull(
        decoder.decode(
            token("https://auth.example", "authenticated", Instant.now().plusSeconds(300))));
  }

  @Test
  void forgedIssuerIsRejected() {
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token("https://evil.example", "authenticated", Instant.now().plusSeconds(300))));
  }

  @Test
  void wrongAudienceIsRejected() {
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(token("https://auth.example", "other", Instant.now().plusSeconds(300))));
  }

  @Test
  void expiredTokenIsRejected() {
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token("https://auth.example", "authenticated", Instant.now().minusSeconds(300))));
  }

  @Test
  void signatureTamperingIsRejected() {
    String token = token("https://auth.example", "authenticated", Instant.now().plusSeconds(300));
    int split = token.lastIndexOf('.');
    String corrupt = token.substring(0, split + 1) + "X" + token.substring(split + 2);
    assertThrows(JwtException.class, () -> decoder.decode(corrupt));
  }
}
