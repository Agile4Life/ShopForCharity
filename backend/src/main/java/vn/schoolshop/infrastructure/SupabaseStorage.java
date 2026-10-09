package vn.schoolshop.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import vn.schoolshop.common.ApiException;

@Component
public class SupabaseStorage implements StoragePort {
  private final String base, key;
  private final ObjectMapper mapper;
  private final HttpClient client =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  public SupabaseStorage(
      @Value("${app.supabase-url}") String base,
      @Value("${app.storage-key}") String key,
      ObjectMapper mapper) {
    this.base = base.replaceAll("/+$", "");
    this.key = key;
    this.mapper = mapper;
  }

  private String call(String method, String path, byte[] content, String mime) {
    ApiException.check(!key.isBlank(), 503, "STORAGE_UNAVAILABLE", "Chưa cấu hình Storage.");
    try {
      var req =
          HttpRequest.newBuilder(URI.create(base + "/storage/v1/" + path))
              .timeout(Duration.ofSeconds(15))
              .header("apikey", key)
              .header("Authorization", "Bearer " + key)
              .header("Content-Type", mime)
              .method(method, HttpRequest.BodyPublishers.ofByteArray(content))
              .build();
      var response = client.send(req, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300)
        throw new ApiException(503, "STORAGE_UNAVAILABLE", "Không thể xử lý ảnh.");
      return response.body();
    } catch (ApiException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ApiException(503, "STORAGE_UNAVAILABLE", "Không thể xử lý ảnh.");
    } catch (Exception e) {
      throw new ApiException(503, "STORAGE_UNAVAILABLE", "Không thể xử lý ảnh.");
    }
  }

  public void upload(String bucket, String path, byte[] content, String mime) {
    call("POST", "object/" + bucket + "/" + path, content, mime);
  }

  public void delete(String bucket, String path) {
    try {
      call(
          "DELETE",
          "object/" + bucket,
          mapper.writeValueAsBytes(Map.of("prefixes", java.util.List.of(path))),
          "application/json");
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  public String signed(String bucket, String path, int seconds) {
    try {
      String body =
          call(
              "POST",
              "object/sign/" + bucket + "/" + path,
              mapper.writeValueAsBytes(Map.of("expiresIn", seconds)),
              "application/json");
      String url = mapper.readTree(body).path("signedURL").asText();
      ApiException.check(
          url.startsWith("/object/sign/"),
          503,
          "STORAGE_UNAVAILABLE",
          "Không thể cấp quyền xem ảnh.");
      return base + "/storage/v1" + url;
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new ApiException(503, "STORAGE_UNAVAILABLE", "Không thể cấp quyền xem ảnh.");
    }
  }

  public String publicUrl(String bucket, String path) {
    return base + "/storage/v1/object/public/" + bucket + "/" + path;
  }
}
