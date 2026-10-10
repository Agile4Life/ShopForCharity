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
import type { CreateOrderResponse } from "../../types/api";
import { withRequestDeadline } from "../../lib/request-state";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";

export const OrderSuccessPage: React.FC = () => {
  const location = useLocation();
  const state = location.state as {
    order?: CreateOrderResponse;
    buyer?: { fullName: string; phone: string; email: string };
    pickupPoint?: string;
    paymentMethod?: string;
  } | null;

  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

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
        `Gói Ấm Cho Em\nMã đơn: ${order.orderCode}\nKhóa truy cập: ${order.guestAccessToken}\nTra cứu: ${window.location.origin}/guest-order`,
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
      <PurchaseSteps step={3} />
      <div className="success-card card">
        <div className="success-icon-wrap">
          <CheckCircle2 size={56} className="text-green" />
        </div>

        <h1 className="success-title">Đã nhận đơn hàng</h1>
        <p className="success-subtitle">
          Người bán sẽ liên hệ xác nhận thời gian nhận.
        </p>

        <div className="order-summary-box">
          <div className="summary-field">
            <span className="field-label">Mã đơn hàng:</span>
            <strong className="field-value order-code-highlight">
              {order.orderCode}
            </strong>
          </div>

          <div className="summary-field">
            <span className="field-label">Tổng tiền đơn hàng:</span>
            <span className="field-value">
              {order.total.toLocaleString("vi-VN")} đ
            </span>
          </div>

          <div className="summary-field">
            <span className="field-label">Trạng thái xử lý:</span>
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="summary-field">
            <span className="field-label">Trạng thái thanh toán:</span>
            <PaymentStatusBadge status={order.paymentStatus} />
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
          <ol className="next-steps-list">
            <li>
              {state.paymentMethod === "BANK_TRANSFER" ? (
                <span>
                  Mở đơn để lấy mã QR sau khi shop xác nhận. Chuyển xong, nhấn
                  “Tôi đã chuyển khoản”.
                </span>
              ) : (
                <span>Trả tiền mặt khi nhận hàng.</span>
              )}
            </li>
          </ol>
        </div>

        <div className="success-actions mt-4">
          <Link
            to={
              order.guestAccessToken
                ? "/guest-order"
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
