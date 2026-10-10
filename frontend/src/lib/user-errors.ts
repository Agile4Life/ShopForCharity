const messages: Record<string, string> = {
  NETWORK_ERROR: "Không thể kết nối. Kiểm tra mạng rồi thử lại.",
  REQUEST_TIMEOUT: "Phản hồi đang chậm. Kiểm tra kết nối rồi thử tải lại.",
  WRITE_TIMEOUT: "Chưa xác nhận được kết quả. Kiểm tra dữ liệu hoặc trạng thái đơn trước khi thử lại.",
  AUTH_REQUIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  INVALID_TOKEN: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
  AUTH_UNAVAILABLE: "Chưa kết nối được dịch vụ đăng nhập. Vui lòng thử lại sau.",
  ACCOUNT_DISABLED: "Tài khoản đang bị khóa. Vui lòng liên hệ shop để được hỗ trợ.",
  SELLER_REQUIRED: "Tài khoản này chưa có quyền quản lý shop.",
  VERSION_CONFLICT: "Dữ liệu đã thay đổi ở nơi khác. Tải lại để xem thông tin mới trước khi lưu.",
  INVALID_TRANSITION: "Đơn chưa đủ điều kiện cho thao tác này hoặc đã đổi trạng thái. Kiểm tra lại tiến trình đơn.",
  INVALID_PAYMENT_TRANSITION: "Trạng thái thanh toán đã thay đổi. Kiểm tra lại trước khi đối soát.",
  SHOP_CLOSED: "Shop đang ngừng nhận đơn mới. Bạn có thể giữ giỏ và quay lại sau.",
  INSUFFICIENT_STOCK: "Số lượng còn lại không đủ. Giảm số lượng trong giỏ rồi thử lại.",
  CATALOG_UNAVAILABLE: "Một món đã ngừng bán hoặc hết hàng. Kiểm tra lại giỏ hàng.",
  CHECKOUT_CHANGED: "Giá hoặc hàng trong giỏ đã thay đổi. Kiểm tra lại tổng tiền trước khi đặt đơn.",
  INVALID_QUOTE: "Thông tin giá đã hết hiệu lực. Cập nhật giá rồi đặt lại đơn.",
  QUOTE_EXPIRED: "Thông tin giá đã hết hiệu lực. Cập nhật giá rồi đặt lại đơn.",
  RESERVATION_EXPIRED: "Đơn đã quá hạn giữ hàng. Kiểm tra trạng thái đơn hoặc liên hệ shop.",
  INVALID_GUEST_ACCESS: "Mã đơn hoặc khóa truy cập chưa đúng. Kiểm tra lại thông tin tra cứu.",
  BANK_NOT_CONFIGURED: "Shop chưa thiết lập chuyển khoản. Chọn tiền mặt hoặc liên hệ shop.",
  NO_BANK_INSTRUCTIONS: "Đơn này chưa có hướng dẫn chuyển khoản. Kiểm tra phương thức và trạng thái đơn.",
  BANK_FIELDS_REQUIRED: "Vui lòng điền đầy đủ thông tin ngân hàng.",
  INVALID_BANK_INPUT: "Thông tin ngân hàng chưa hợp lệ. Kiểm tra lại các trường đã nhập.",
  BANK_REFERENCE_DUPLICATE: "Mã giao dịch này đã được ghi nhận. Kiểm tra đối soát trước khi lưu lại.",
  CONFIRMED_PICKUP_REQUIRED: "Vui lòng chọn điểm nhận và giờ hẹn trong tương lai.",
  INVALID_PICKUP_POINT: "Điểm nhận này không còn hoạt động. Vui lòng chọn điểm khác.",
  INVALID_PICKUP_TIME: "Vui lòng chọn giờ nhận hợp lệ trong tương lai.",
  INVALID_DATE: "Ngày giờ chưa hợp lệ. Vui lòng kiểm tra lại.",
  PICKUP_POINT_CHANGED: "Điểm nhận đã thay đổi. Vui lòng chọn lại điểm nhận hàng.",
  FILE_TOO_LARGE: "Ảnh vượt quá dung lượng cho phép. Chọn ảnh nhỏ hơn 4 MiB.",
  REQUEST_TOO_LARGE: "Dữ liệu gửi quá lớn. Giảm dung lượng ảnh rồi thử lại.",
  IMAGE_DIMENSIONS_EXCEEDED: "Kích thước ảnh quá lớn. Giảm độ phân giải rồi tải lại.",
  INVALID_IMAGE: "Không đọc được ảnh. Chọn ảnh JPEG, PNG hoặc WebP khác.",
  UNSUPPORTED_IMAGE: "Định dạng ảnh chưa được hỗ trợ. Chọn JPEG, PNG hoặc WebP.",
  IMAGE_REQUIRED: "Vui lòng thêm hình ảnh trước khi mở bán.",
  FILE_REQUIRED: "Vui lòng chọn ảnh để tải lên.",
  INVALID_ASSET: "Ảnh đã chọn không còn khả dụng. Vui lòng tải ảnh lên lại.",
  INVALID_ASSET_TYPE: "Ảnh không phù hợp với mục này. Vui lòng chọn ảnh khác.",
  STORAGE_UNAVAILABLE: "Chưa tải được ảnh lên. Vui lòng thử lại sau.",
  INVALID_PHONE: "Số điện thoại chưa hợp lệ. Ví dụ: 0912345678.",
  INVALID_BUYER_NAME: "Vui lòng nhập họ tên người nhận hợp lệ.",
  NAME_REQUIRED: "Vui lòng nhập tên trước khi lưu.",
  INVALID_NAME: "Tên chưa hợp lệ. Kiểm tra lại nội dung đã nhập.",
  INVALID_CATEGORY: "Danh mục đã chọn không còn khả dụng. Vui lòng chọn lại.",
  INVALID_QUANTITY: "Số lượng phải là số nguyên trong giới hạn cho phép.",
  INVALID_CART: "Giỏ hàng chưa hợp lệ. Kiểm tra lại các món và số lượng.",
  DUPLICATE_CART_LINE: "Giỏ có món bị lặp. Kiểm tra lại giỏ trước khi đặt đơn.",
  INVALID_COMBO: "Combo cần ít nhất hai sản phẩm khác nhau với số lượng hợp lệ.",
  DUPLICATE_COMPONENT: "Sản phẩm thành phần đang bị lặp. Kiểm tra lại combo.",
  INVALID_COMBO_PRICE: "Giá combo chưa hợp lệ. Vui lòng kiểm tra lại.",
  INVALID_STOCK: "Số lượng tồn kho chưa hợp lệ. Kiểm tra lại trước khi lưu.",
  INVALID_STOCK_INPUT: "Thông tin điều chỉnh tồn kho chưa hợp lệ. Kiểm tra lại số lượng.",
  RESERVED_STOCK_CONFLICT: "Một phần hàng đang được giữ cho đơn khác. Kiểm tra lại tồn kho.",
  STOCK_ACTION_REQUIRED: "Vui lòng dùng chức năng điều chỉnh tồn kho để đổi số lượng hàng.",
  AMOUNT_REQUIRED: "Vui lòng nhập số tiền thực nhận hợp lệ.",
  REASON_REQUIRED: "Vui lòng nhập lý do trước khi xác nhận.",
  REFUND_AMOUNT_MISMATCH: "Số tiền hoàn chưa khớp số tiền đã thu. Kiểm tra lại đối soát.",
  PAYMENT_REVIEW_REQUIRED: "Thanh toán cần được shop kiểm tra trước khi tiếp tục.",
  PAYMENT_RECONCILIATION_REQUIRED: "Vui lòng đối soát thanh toán trước khi hoàn tất đơn.",
  REFUND_REQUIRED: "Đơn cần xử lý hoàn tiền trước khi tiếp tục.",
  TOTAL_TOO_LARGE: "Giá trị đơn vượt giới hạn cho phép. Giảm số lượng trong giỏ.",
  RATE_LIMITED: "Bạn thao tác hơi nhanh. Chờ một lát rồi thử lại.",
  DATA_CONFLICT: "Thông tin đang trùng hoặc đã thay đổi. Kiểm tra lại trước khi lưu.",
  IDEMPOTENCY_MISMATCH: "Yêu cầu trước đang có dữ liệu khác. Kiểm tra kết quả trước khi gửi lại.",
  VALIDATION_ERROR: "Một số thông tin chưa hợp lệ. Kiểm tra lại các trường đã nhập.",
  REQUIRED_FIELDS: "Vui lòng điền đầy đủ thông tin bắt buộc.",
  NOT_FOUND: "Không tìm thấy thông tin này. Dữ liệu có thể đã được xóa hoặc ngừng hiển thị.",
  invalid_credentials: "Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.",
  email_not_confirmed: "Vui lòng xác minh email trước khi đăng nhập.",
  user_already_exists: "Email này đã được sử dụng. Đăng nhập hoặc khôi phục mật khẩu.",
  weak_password: "Mật khẩu chưa đủ mạnh. Vui lòng dùng mật khẩu dài hơn.",
  same_password: "Mật khẩu mới cần khác mật khẩu hiện tại.",
  over_email_send_rate_limit: "Bạn đã gửi nhiều yêu cầu email. Chờ một lát rồi thử lại.",
};

export class UserFacingError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

export function userErrorMessage(error: unknown, fallback = "Chưa thực hiện được thao tác. Vui lòng thử lại."): string {
  if (error instanceof UserFacingError) return error.message;
  const raw = error && typeof error === "object" ? error as { code?: unknown; status?: unknown; message?: unknown; name?: unknown } : {};
  const info = {
    code: typeof raw.code === "string" ? raw.code : undefined,
    status: typeof raw.status === "number" ? raw.status : undefined,
    message: typeof raw.message === "string" ? raw.message : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
  };
  if (info.code === "INVALID_TRANSITION" && info.message?.includes("liên hệ")) {
    return "Cần ghi nhận liên hệ thành công với khách trước khi chấp nhận đơn.";
  }
  if (info.code && messages[info.code]) return messages[info.code];
  if (/Invalid login credentials|invalid_grant/i.test(info.message || "")) return messages.invalid_credentials;
  if (info.status === 401) return messages.AUTH_REQUIRED;
  if (info.status === 403) return "Bạn chưa có quyền thực hiện thao tác này. Kiểm tra tài khoản hoặc liên hệ shop.";
  if (info.status === 404) return messages.NOT_FOUND;
  if (info.status === 429) return messages.RATE_LIMITED;
  if (info.status && info.status >= 500) return "Dịch vụ đang gặp sự cố. Vui lòng thử lại sau.";
  if (info.name === "TimeoutError") return messages.REQUEST_TIMEOUT;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(info.message || "")) return messages.NETWORK_ERROR;
  // Plain errors created by local validation may contain helpful Vietnamese text.
  // Never render a backend message, JSON, SQL, stack trace, HTML, or support identifier.
  if (!info.code && !info.status && info.message && info.message.length < 250
    && /[ăâđêôơưạảấầẩậắằẳặẹẻếềểệịỉọỏốồổộớờởợụủứừửựỳỵỷ]/i.test(info.message)
    && !/[{}<>\n]|SQL|SELECT\s|INSERT\s|UPDATE\s|DELETE\s|stack|Exception|request.?id|https?:/i.test(info.message)
    && !/\b[A-Z_]{5,}\b/.test(info.message)) return info.message;
  return fallback;
}
