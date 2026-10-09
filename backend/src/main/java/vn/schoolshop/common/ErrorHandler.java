package vn.schoolshop.common;

import java.time.Instant;
import java.util.List;
import org.springframework.dao.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ErrorHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> api(ApiException e) {
    return body(e.status, e.code, e.getMessage(), e.details);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> validation(MethodArgumentNotValidException e) {
    return body(
        400,
        "VALIDATION_ERROR",
        "Dữ liệu không hợp lệ.",
        e.getBindingResult().getFieldErrors().stream()
            .map(x -> Views.map("field", x.getField(), "message", x.getDefaultMessage()))
            .toList());
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
    org.springframework.web.bind.MissingRequestHeaderException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class
  })
  ResponseEntity<?> bad(Exception e) {
    return body(400, "INVALID_REQUEST", "Yêu cầu không hợp lệ.", List.of());
  }

  @ExceptionHandler({
    OptimisticLockingFailureException.class,
    jakarta.persistence.OptimisticLockException.class
  })
  ResponseEntity<?> conflict(Exception e) {
    return body(409, "VERSION_CONFLICT", "Dữ liệu đã thay đổi. Vui lòng tải lại.", List.of());
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> constraint(Exception e) {
    return body(409, "DATA_CONFLICT", "Dữ liệu trùng hoặc không còn hợp lệ.", List.of());
  }

  @ExceptionHandler({
    CannotAcquireLockException.class,
    QueryTimeoutException.class,
    org.springframework.transaction.CannotCreateTransactionException.class
  })
  ResponseEntity<?> unavailable(Exception e) {
    return body(
        503, "DEPENDENCY_UNAVAILABLE", "Dịch vụ tạm không sẵn sàng. Vui lòng thử lại.", List.of());
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<?> tooLarge(Exception e) {
    return body(413, "FILE_TOO_LARGE", "Ảnh tối đa 5 MB.", List.of());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> internal(Exception e) {
    org.slf4j.LoggerFactory.getLogger(getClass())
        .error(
            "Unhandled error type={} requestId={}",
            e.getClass().getSimpleName(),
            RequestContext.id());
    return body(500, "INTERNAL_ERROR", "Không thể xử lý yêu cầu.", List.of());
  }

  public static ResponseEntity<?> body(int status, String code, String message, Object details) {
    var builder = ResponseEntity.status(status).header("Cache-Control", "no-store");
    if (status == 429) builder.header("Retry-After", "60");
    return builder.body(
        Views.map(
            "code",
            code,
            "message",
            message,
            "details",
            details,
            "requestId",
            RequestContext.id(),
            "timestamp",
            Instant.now()));
  }
}
