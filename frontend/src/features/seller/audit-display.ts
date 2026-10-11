import { ORDER_STATUS_MAP, PAYMENT_STATUS_MAP, PRODUCT_STATUS_MAP } from "../../components/StatusBadge";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "Tạo đơn hàng",
  ORDER_ACCEPTED: "Xác nhận đơn hàng",
  ORDER_PREPARING: "Chuẩn bị đơn hàng",
  ORDER_READY: "Đơn hàng sẵn sàng nhận",
  ORDER_COMPLETED: "Hoàn tất đơn hàng",
  ORDER_REJECTED: "Từ chối đơn hàng",
  ORDER_CANCELLED: "Hủy đơn hàng",
  ORDER_EXPIRED: "Đơn hàng hết hạn",
  CONTACT_RECORDED: "Ghi nhận liên hệ",
  STOCK_RESERVED: "Giữ hàng cho đơn",
  STOCK_RELEASED: "Giải phóng hàng đã giữ",
  STOCK_CONSUMED: "Xuất kho",
  STOCK_ADJUSTED: "Điều chỉnh tồn kho",
  PRODUCT_CREATED: "Tạo sản phẩm",
  PRODUCT_UPDATED: "Cập nhật sản phẩm",
  PRODUCT_ACTIVATED: "Mở bán sản phẩm",
  PRODUCT_ARCHIVED: "Ẩn sản phẩm",
  COMBO_CREATED: "Tạo combo",
  COMBO_UPDATED: "Cập nhật combo",
  COMBO_ACTIVATED: "Mở bán combo",
  COMBO_ARCHIVED: "Ẩn combo",
  PICKUP_POINT_CHANGED: "Cập nhật điểm nhận",
  PAYMENT_SETTINGS_VERSION_CREATED: "Cập nhật thiết lập thanh toán",
  SHOP_SETTINGS_UPDATED: "Cập nhật cửa hàng",
  PAYMENT_REPORTED: "Báo chuyển khoản",
  PAYMENT_CONFIRMED: "Xác nhận thanh toán",
  PAYMENT_RECONCILIATION_REQUIRED: "Yêu cầu đối soát thanh toán",
  PAYMENT_RECEIVED_AFTER_CANCELLATION: "Nhận tiền sau khi hủy đơn",
  PAYMENT_REPORT_DISMISSED: "Bác bỏ báo chuyển khoản",
  REFUND_REQUIRED: "Yêu cầu hoàn tiền",
  REFUND_CONFIRMED: "Xác nhận hoàn tiền",
  PAYMENT_REVIEW_REQUIRED: "Cần kiểm tra thanh toán",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  ORDER: "Đơn hàng", PRODUCT: "Sản phẩm", COMBO: "Combo",
  PICKUP_POINT: "Điểm nhận", PAYMENT_SETTINGS: "Thiết lập thanh toán", SHOP: "Cửa hàng",
};

export const AUDIT_ACTOR_LABELS: Record<string, string> = {
  SELLER: "Người bán", CUSTOMER: "Khách hàng", GUEST: "Khách vãng lai", SYSTEM: "Hệ thống",
};

const detailLabels: Record<string, string> = {
  status: "Trạng thái", paymentStatus: "Thanh toán", quantity: "Số lượng",
  total: "Tổng tiền", price: "Giá", stockOnHand: "Tồn kho", stockReserved: "Đã giữ",
  outcome: "Kết quả liên hệ", active: "Hoạt động", acceptingOrders: "Nhận đơn",
  details: "Chi tiết", items: "Các món", name: "Tên", quantityDelta: "Thay đổi số lượng",
  amount: "Số tiền", receivedAmount: "Đã nhận", reason: "Lý do", note: "Ghi chú",
  channel: "Kênh liên hệ", paymentMethod: "Cách thanh toán", orderCode: "Mã đơn hàng",
};
const valueLabels: Record<string, string> = {
  ...Object.fromEntries(Object.entries({ ...ORDER_STATUS_MAP, ...PAYMENT_STATUS_MAP, ...PRODUCT_STATUS_MAP })
    .map(([key, value]) => [key, value.label])),
  SUCCESS: "Thành công", NO_ANSWER: "Không nghe máy", WRONG_NUMBER: "Sai số điện thoại",
  NO_RESPONSE: "Chưa phản hồi", FAILED: "Thất bại",
  PHONE: "Gọi điện", EMAIL: "Email", IN_PERSON: "Gặp trực tiếp",
  CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản",
};
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

export function formatAuditDetails(raw?: string): string {
  if (!raw) return "—";
  const formatValue = (value: unknown, key = ""): string => {
    if (value === null) return "Chưa có";
    if (typeof value === "boolean") return value ? "Có" : "Không";
    if (typeof value === "number") return ["total", "price", "amount", "receivedAmount"].includes(key) ? currency.format(value) : value.toLocaleString("vi-VN");
    if (Array.isArray(value)) return value.map(item => formatValue(item, key)).join("; ") || "Không có";
    if (typeof value === "object") return Object.entries(value).map(([name, item]) =>
      `${detailLabels[name] ?? "Thông tin bổ sung"}: ${formatValue(item, name)}`).join(" · ") || "Không có";
    if (typeof value === "string") {
      // Some older records contain JSON encoded inside a string.
      if (/^[\[{]/.test(value.trim())) {
        try { return formatValue(JSON.parse(value), key); } catch { return "Chi tiết chưa thể hiển thị"; }
      }
      return valueLabels[value] ?? (/^[A-Z]+(?:_[A-Z]+)+$/.test(value) ? "Chưa có mô tả" : value);
    }
    return String(value);
  };
  try {
    return formatValue(JSON.parse(raw));
  } catch {
    return formatValue(raw);
  }
}
