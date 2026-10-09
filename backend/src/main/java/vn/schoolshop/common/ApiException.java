package vn.schoolshop.common;

public class ApiException extends RuntimeException {
    public final int status;
    public final String code;
    public final Object details;
    public ApiException(int status, String code, String message) { this(status,code,message,java.util.List.of()); }
    public ApiException(int status, String code, String message, Object details) {
        super(message); this.status=status; this.code=code; this.details=details;
    }
    public static ApiException missing() { return new ApiException(404,"NOT_FOUND","Không tìm thấy dữ liệu."); }
    public static void check(boolean condition, int status, String code, String message) {
        if (!condition) throw new ApiException(status,code,message);
    }
    public static void version(long actual, long expected) {
        if (actual!=expected) throw new ApiException(409,"VERSION_CONFLICT","Dữ liệu đã thay đổi. Vui lòng tải lại.",java.util.Map.of("version",actual));
    }
}
