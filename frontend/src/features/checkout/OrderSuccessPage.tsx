import React, { useState } from 'react';
import { useLocation, Link, Navigate } from 'react-router-dom';
import { CheckCircle2, Copy, Check, Key, ArrowRight, Home } from 'lucide-react';
import type { CreateOrderResponse } from '../../types/api';
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/StatusBadge';

export const OrderSuccessPage: React.FC = () => {
  const location = useLocation();
  const state = location.state as {
    order?: CreateOrderResponse;
    buyer?: { fullName: string; phone: string; email: string };
    pickupPoint?: string;
    paymentMethod?: string;
  } | null;

  const [copied, setCopied] = useState(false);

  if (!state?.order) {
    return <Navigate to="/" replace />;
  }

  const { order } = state;

  const handleCopyCredentials = () => {
    if (!order.guestAccessToken) return;
    const textToCopy = `Mã đơn hàng: ${order.orderCode}\nKhóa truy cập đơn guest: ${order.guestAccessToken}\nWebsite: ${window.location.origin}/guest-order`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <div className="order-success-page container">
      <div className="success-card card">
        <div className="success-icon-wrap">
          <CheckCircle2 size={56} className="text-green" />
        </div>

        <h1 className="success-title">Đặt hàng thành công!</h1>
        <p className="success-subtitle">
          Cảm ơn bạn. Đơn hàng của bạn đã được ghi nhận vào hệ thống và đang chờ người bán liên hệ xác nhận.
        </p>

        <div className="order-summary-box">
          <div className="summary-field">
            <span className="field-label">Mã đơn hàng:</span>
            <strong className="field-value order-code-highlight">{order.orderCode}</strong>
          </div>

          <div className="summary-field">
            <span className="field-label">Tổng tiền đơn hàng:</span>
            <span className="field-value">{order.total.toLocaleString('vi-VN')} đ</span>
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
              <h3 className="credentials-title">Khóa truy cập cho đơn hàng Guest</h3>
            </div>
            <p className="credentials-desc">
              Bạn đang đặt hàng không qua tài khoản. Hãy sao chép và lưu lại <strong>Mã đơn hàng</strong> và <strong>Khóa truy cập</strong> dưới đây để có thể tra cứu đơn hàng bất cứ lúc nào!
            </p>

            <div className="credential-row">
              <span className="cred-label">Khóa bí mật:</span>
              <code className="cred-code">{order.guestAccessToken}</code>
            </div>

            <button
              type="button"
              onClick={handleCopyCredentials}
              className="btn-secondary full-width mt-2"
            >
              {copied ? (
                <>
                  <Check size={16} /> Đã sao chép vào bộ nhớ tạm!
                </>
              ) : (
                <>
                  <Copy size={16} /> Sao chép thông tin tra cứu
                </>
              )}
            </button>
          </div>
        )}

        {/* Next Steps Guidance */}
        <div className="next-steps-card">
          <h4>Quy trình tiếp theo:</h4>
          <ol className="next-steps-list">
            <li>Người bán sẽ gọi điện hoặc gửi email cho bạn để xác nhận đơn và hẹn giờ nhận hàng cụ thể.</li>
            <li>
              {state.paymentMethod === 'BANK_TRANSFER' ? (
                <span>
                  <strong>Đối với chuyển khoản:</strong> Sau khi người bán chấp nhận đơn, bạn mở trang tra cứu đơn để lấy mã QR và quét chuyển khoản. Nhấn nút "Tôi đã chuyển khoản" sau khi chuyển.
                </span>
              ) : (
                <span>
                  <strong>Đối với tiền mặt:</strong> Bạn sẽ thanh toán trực tiếp cho người bán khi nhận hàng tại điểm hẹn.
                </span>
              )}
            </li>
          </ol>
        </div>

        <div className="success-actions mt-4">
          <Link to={`/guest-order`} className="btn-primary">
            Tra cứu đơn hàng <ArrowRight size={16} />
          </Link>
          <Link to="/" className="btn-secondary">
            <Home size={16} /> Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
};
