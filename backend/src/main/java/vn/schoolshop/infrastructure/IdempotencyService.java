package vn.schoolshop.infrastructure;

import static vn.schoolshop.common.ApiException.check;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.Actor;

@Service
public class IdempotencyService {
  private final DomainRepository db;
  private final Crypto crypto;
  private final ObjectMapper mapper;
  private final Clock clock;

  public IdempotencyService(DomainRepository db, Crypto crypto, ObjectMapper mapper, Clock clock) {
    this.db = db;
    this.crypto = crypto;
    this.mapper = mapper;
    this.clock = clock;
  }

  /** Caller must hold the shop lock and execute within the business transaction. */
  public Map<String, Object> run(
      Actor actor,
      String route,
      String key,
      Object input,
      Supplier<Map<String, Object>> operation) {
    check(
        key != null && key.matches("[A-Za-z0-9_-]{22,128}"),
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Cần Idempotency-Key ngẫu nhiên tối thiểu 128-bit.");
    try {
      String scope = Crypto.hash(actor.scope() + ":" + route),
          hash = Crypto.hash(mapper.writeValueAsString(input));
      var existing =
          db.list(
              IdempotencyRecord.class,
              "e.callerScopeHash=:scope and e.key=:key",
              Map.of("scope", scope, "key", key));
      if (!existing.isEmpty()) {
        var record = existing.getFirst();
        if (record.expiresAt.isAfter(clock.instant())) {
          check(
              record.requestHash.equals(hash),
              409,
              "IDEMPOTENCY_MISMATCH",
              "Key đã được dùng với dữ liệu khác.");
          return mapper.readValue(
              crypto.decrypt(record.encryptedResponse),
              new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        }
        db.remove(record);
        db.flush();
      }
      var result = operation.get();
      db.flush();
      var record = new IdempotencyRecord();
      record.callerScopeHash = scope;
      record.key = key;
      record.requestHash = hash;
      record.encryptedResponse = crypto.encrypt(mapper.writeValueAsString(result));
      record.expiresAt = clock.instant().plus(Duration.ofHours(48));
      db.add(record);
      return result;
    } catch (ApiException e) {
      throw e;
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Cannot serialize operation result");
    }
  }
}
