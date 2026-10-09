package vn.schoolshop.common;
import org.slf4j.MDC;
import java.util.UUID;
public final class RequestContext {
    private RequestContext() {}
    public static String id() { String id=MDC.get("requestId");return id==null?UUID.randomUUID().toString():id; }
}
