import React, { useState } from "react";
import { useLocation, Link, Navigate } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  Check,
  Key,
  ArrowRight,
  Home,
  Download,
} from "lucide-react";
import { PurchaseSteps, notify } from "../../components/Usability";
import type { CreateOrderResponse, OrderDetail } from "../../types/api";
import { SuccessBankPayment } from "./SuccessBankPayment";
import { withRequestDeadline } from "../../lib/request-state";
import { OrderCode, CopyOrderCode } from "../../components/OrderCode";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { Modal } from "../../components/Modal";

const THANK_YOU_MESSAGE =
  "Cảm ơn bạn đã ủng hộ dự án gói ấm trao em, toàn bộ số tiền lời sẽ đóng góp để mua quà cho các em ở trung tâm nhân đạo Quê Hương";

export const OrderSuccessPage: React.FC = () => {
  const location = useLocation();
  const state = location.state as {
    order?: CreateOrderResponse;
    buyer?: { fullName: string; phone: string; email?: string };
    pickupPoint?: string;
    paymentMethod?: string;
  } | null;

  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [updatedOrder, setUpdatedOrder] = useState<OrderDetail | null>(null);
  const [thankYouOpen, setThankYouOpen] = useState(true);

  if (!state?.order) {
    return <Navigate to="/" replace />;
  }

  const { order } = state;

  const handleCopyCredentials = async () => {
    if (!order.guestAccessToken || copying) return;
    const textToCopy = `Mã đơn hàng: ${order.orderCode}\nKhóa truy cập: ${order.guestAccessToken}\nWebsite: ${window.location.origin}/guest-order`;
    setCopying(true);
    try {
      await withRequestDeadline(() => navigator.clipboard.writeText(textToCopy), { timeoutMs: 5000, write: true, allowOffline: true });
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      notify("Chưa sao chép được. Bạn có thể tải thông tin về máy.", { tone: "error" });
    } finally { setCopying(false); }
  };
  const downloadCredentials = () => {
    const blob = new Blob(
      [
        `Gói Ấm Trao Em\nMã đơn: ${order.orderCode}\nKhóa truy cập: ${order.guestAccessToken}\nTra cứu: ${window.location.origin}/guest-order`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `don-hang-${order.orderCode}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="order-success-page container">
      <Modal
        isOpen={thankYouOpen}
        onClose={() => setThankYouOpen(false)}
        title="Lời cảm ơn"
      >
        <p className="text-base mb-4">{THANK_YOU_MESSAGE}</p>
        <div className="modal-actions">
          <button
            type="button"
            data-autofocus
            onClick={() => setThankYouOpen(false)}
            className="btn-primary"
          >
            Đã hiểu
          </button>
        </div>
      </Modal>
      <PurchaseSteps step={3} />
      <div className="success-card card">
        <div className="success-icon-wrap">
          <CheckCircle2 size={56} className="text-green" />
        </div>

        <h1 className="success-title">Đã nhận đơn hàng</h1>
        <p className="success-subtitle">
          Người bán sẽ liên hệ qua số điện thoại để xác nhận thời gian nhận hàng tại điểm nhận đã chọn.
        </p>

        <div className="order-summary-box">
          <div className="summary-field">
            <span className="field-label">Mã đơn hàng:</span>
            <strong className="field-value order-code-highlight">
              <OrderCode value={order.orderCode} />
            </strong>
          </div>

          <CopyOrderCode value={order.orderCode} />

          <div className="summary-field">
            <span className="field-label">Tổng tiền đơn hàng:</span>
            <span className="field-value">
              {order.total.toLocaleString("vi-VN")} đ
            </span>
          </div>

          <div className="summary-field">
            <span className="field-label">Trạng thái xử lý:</span>
            <OrderStatusBadge status={updatedOrder?.status ?? order.status} />
          </div>

          <div className="summary-field">
            <span className="field-label">Trạng thái thanh toán:</span>
            <PaymentStatusBadge status={updatedOrder?.paymentStatus ?? order.paymentStatus} />
          </div>

          {state.pickupPoint && (
            <div className="summary-field">
              <span className="field-label">Điểm nhận hàng:</span>
              <span className="field-value">{state.pickupPoint}</span>
            </div>
          )}
        </div>

        {/* Guest Access Token Security Box */}
        {order.guestAccessToken && (
          <div className="guest-credentials-box">
            <div className="credentials-header">
              <Key size={20} className="text-amber" />
              <h2 className="credentials-title">Lưu thông tin tra cứu</h2>
            </div>
            <p className="credentials-desc">
              Giữ mã đơn và khóa truy cập để xem đơn sau khi đóng trang.
            </p>

            <div className="credential-row">
              <span className="cred-label">Khóa bí mật:</span>
              <code className="cred-code">{order.guestAccessToken}</code>
            </div>

            <button
              type="button"
              onClick={handleCopyCredentials}
              disabled={copying}
              aria-busy={copying}
              className="btn-secondary full-width mt-2"
            >
              {copying ? "Đang sao chép…" : copied ? (
                <>
                  <Check size={16} /> Đã sao chép
                </>
              ) : (
                <>
                  <Copy size={16} /> Sao chép thông tin tra cứu
                </>
              )}
            </button>
            <button
              type="button"
              onClick={downloadCredentials}
              className="btn-text-sm full-width mt-2"
            >
              <Download size={17} aria-hidden="true" /> Tải thông tin về máy
            </button>
          </div>
        )}

        {/* Next Steps Guidance */}
        <div className="next-steps-card">
          <h2>Thanh toán</h2>
          {state.paymentMethod === "BANK_TRANSFER" ? (
            <SuccessBankPayment order={order} onOrderUpdated={setUpdatedOrder} />
          ) : <p>Trả tiền mặt khi nhận hàng.</p>}
        </div>

        <div className="success-actions mt-4">
          <Link
            to={
              order.guestAccessToken
                ? "/account/orders?view=lookup"
                : `/account/orders/${order.orderId}`
            }
            state={
              order.guestAccessToken
                ? {
                    orderCode: order.orderCode,
                    guestToken: order.guestAccessToken,
                  }
                : undefined
            }
            className="btn-primary"
          >
            Xem đơn hàng <ArrowRight size={16} />
          </Link>
          <Link to="/" className="btn-secondary">
            <Home size={16} /> Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
};
