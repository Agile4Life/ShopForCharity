package vn.schoolshop.common;

import java.util.UUID;
import org.slf4j.MDC;

public final class RequestContext {
  private RequestContext() {}

  public static String id() {
    String id = MDC.get("requestId");
    return id == null ? UUID.randomUUID().toString() : id;
  }
}
