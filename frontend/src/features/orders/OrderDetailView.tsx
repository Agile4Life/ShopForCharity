import {
  notifyError as notify,
  OrderProgress,
} from "../../components/Usability";
import React, { useState } from "react";
import {
  CreditCard,
  QrCode,
  AlertCircle,
  Clock,
  CheckCircle,
  Info,
} from "lucide-react";
import type { OrderDetail, PaymentInstructions } from "../../types/api";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { Modal } from "../../components/Modal";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { AssetImage } from "../../components/AssetImage";

interface OrderDetailViewProps {
  order: OrderDetail;
  paymentInstructions?: PaymentInstructions | null;
  onCancelOrder?: (reason: string, expectedVersion: number) => Promise<void>;
  onReportPayment?: (expectedVersion: number) => Promise<void>;
  isCancelling?: boolean;
  isReportingPayment?: boolean;
  paymentLoading?: boolean;
  paymentError?: unknown;
  onRetryPayment?: () => void;
}

export const OrderDetailView: React.FC<OrderDetailViewProps> = ({
  order,
  paymentInstructions,
  onCancelOrder,
  onReportPayment,
  isCancelling = false,
  isReportingPayment = false,
  paymentLoading = false,
  paymentError,
  onRetryPayment,
}) => {
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const canCancel =
    order.status === "PENDING_CONTACT" && order.paymentStatus === "UNPAID";

  const canReportPayment =
    order.paymentMethod === "BANK_TRANSFER" &&
    order.paymentStatus === "UNPAID" &&
    ["ACCEPTED", "PREPARING", "READY"].includes(order.status);

  const isBankPendingContact =
    order.paymentMethod === "BANK_TRANSFER" &&
    order.status === "PENDING_CONTACT";

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      notify("Vui lòng nhập lý do hủy đơn hàng");
      return;
    }
    if (onCancelOrder) {
      try {
        await onCancelOrder(cancelReason.trim(), order.version);
        setCancelModalOpen(false);
        setCancelReason("");
      } catch (error) {
        notify(error, "Chưa hủy được đơn. Kiểm tra trạng thái đơn và thử lại.");
      }
    }
  };

  return (
    <div className="order-detail-view">
      {/* Header Info */}
      <div className="order-view-header card">
        <div className="header-meta">
          <span className="text-muted text-sm">Mã đơn hàng:</span>
          <h1 className="order-code-title">{order.orderCode}</h1>
          <span className="order-date text-xs text-muted">
            Tạo lúc: {new Date(order.createdAt).toLocaleString("vi-VN")}
          </span>
        </div>

        <div className="header-status-badges">
          <div className="status-item">
            <span className="badge-label text-xs text-muted">
              Trạng thái đơn:
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="status-item">
            <span className="badge-label text-xs text-muted">Thanh toán:</span>
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
      </div>

      <OrderProgress status={order.status} />
      <div className="order-view-grid">
        {/* Left Column: Order Items & Pickup */}
        <div className="order-view-main">
          {/* Items breakdown */}
          <div className="card mb-4">
            <h3 className="section-title-sm">Danh sách món đặt</h3>
            <div className="items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Món / Combo</th>
                    <th className="text-right">Đơn giá</th>
                    <th className="text-center">Số lượng</th>
                    <th className="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.nameSnapshot}</strong>
                        <span className="badge badge-gray text-xs ml-2">
                          {item.kind === "COMBO" ? "Combo" : "Món"}
                        </span>
                      </td>
                      <td className="text-right" data-label="Đơn giá">
                        {item.unitPrice.toLocaleString("vi-VN")} đ
                      </td>
                      <td className="text-center" data-label="Số lượng">x{item.quantity}</td>
                      <td className="text-right font-medium" data-label="Thành tiền">
                        {item.lineTotal.toLocaleString("vi-VN")} đ
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="text-right font-bold">
                      Tổng tiền:
                    </td>
                    <td className="text-right font-bold text-lg text-primary">
                      {order.total.toLocaleString("vi-VN")} đ
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Pickup and Contact Info */}
          <div className="card mb-4">
            <h3 className="section-title-sm">Thông tin nhận hàng & Liên hệ</h3>
            <div className="info-list">
              <div className="info-row">
                <span className="info-label">Người nhận:</span>
                <span className="info-val">
                  {order.buyerName} ({order.buyerPhone}) - {order.buyerEmail}
                </span>
              </div>
              {order.buyerClass && (
                <div className="info-row">
                  <span className="info-label">Lớp:</span>
                  <span className="info-val">{order.buyerClass}</span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Điểm hẹn nhận hàng:</span>
                <span className="info-val">
                  <strong>{order.pickupPointName}</strong>
                  {order.pickupInstructions && (
                    <span className="text-muted block text-xs">
                      Hướng dẫn: {order.pickupInstructions}
                    </span>
                  )}
                </span>
              </div>
              {order.requestedPickupAt && (
                <div className="info-row">
                  <span className="info-label">Thời gian mong muốn:</span>
                  <span className="info-val">
                    {new Date(order.requestedPickupAt).toLocaleString("vi-VN")}
                  </span>
                </div>
              )}
              {order.confirmedPickupAt && (
                <div className="info-row text-green">
                  <span className="info-label">Thời gian hẹn đã xác nhận:</span>
                  <span className="info-val font-bold">
                    {new Date(order.confirmedPickupAt).toLocaleString("vi-VN")}
                  </span>
                </div>
              )}
              {order.note && (
                <div className="info-row">
                  <span className="info-label">Ghi chú của bạn:</span>
                  <span className="info-val italic">{order.note}</span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline of Status History */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="card mb-4">
              <h3 className="section-title-sm">Lịch sử tiến độ đơn hàng</h3>
              <div className="timeline-list">
                {order.statusHistory.map((h) => (
                  <div key={h.id} className="timeline-item">
                    <div className="timeline-icon">
                      <Clock size={16} />
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-time text-xs text-muted">
                        {new Date(h.createdAt).toLocaleString("vi-VN")}
                      </div>
                      <div className="timeline-action">
                        Chuyển sang trạng thái:{" "}
                        <OrderStatusBadge status={h.toStatus} />
                      </div>
                      {h.reason && (
                        <p className="timeline-reason text-xs text-muted">
                          {h.reason}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Payment & Actions */}
        <div className="order-view-sidebar">
          {/* Payment Card */}
          <div className="card mb-4">
            <h3 className="section-title-sm">
              <CreditCard size={18} /> Thông tin thanh toán
            </h3>
            <div className="payment-method-desc mb-3">
              Phương thức:{" "}
              <strong>
                {order.paymentMethod === "CASH"
                  ? "Tiền mặt"
                  : "Chuyển khoản QR"}
              </strong>
            </div>

            {order.paymentMethod === "CASH" && (
              <div className="alert-box alert-info text-sm">
                <Info size={16} />
                <span>
                  Thanh toán bằng tiền mặt trực tiếp cho người bán khi nhận hàng
                  tại trường.
                </span>
              </div>
            )}

            {order.paymentMethod === "BANK_TRANSFER" && (
              <div className="bank-transfer-box">
                {paymentLoading && <LoadingSpinner message="Đang tải hướng dẫn chuyển khoản…" />}
                {paymentError != null && <ErrorMessage error={paymentError} onRetry={onRetryPayment} />}
                {isBankPendingContact && (
                  <div className="alert-box alert-warning text-xs mb-3">
                    <AlertCircle size={16} />
                    <span>
                      Đơn hàng đang chờ người bán liên hệ xác nhận. Vui lòng{" "}
                      <strong>không chuyển tiền trước</strong> cho tới khi đơn
                      chuyển sang trạng thái "Đã xác nhận"!
                    </span>
                  </div>
                )}

                {paymentInstructions && (
                  <div className="payment-instructions-panel">
                    {paymentInstructions.qrSignedUrl ? (
                      <div className="qr-container">
                        <AssetImage
                          src={paymentInstructions.qrSignedUrl}
                          alt="Mã QR Chuyển khoản"
                          className="qr-image"
                          onRetry={onRetryPayment}
                        />
                      </div>
                    ) : (
                      <div className="qr-placeholder">
                        <QrCode size={48} />
                        <span>Quét mã QR ngân hàng của Shop</span>
                      </div>
                    )}

                    <div className="bank-details-list text-sm">
                      <div className="bank-detail-item">
                        <span>Ngân hàng:</span>
                        <strong>{paymentInstructions.bankName}</strong>
                      </div>
                      <div className="bank-detail-item">
                        <span>Số tài khoản:</span>
                        <strong className="text-primary">
                          {paymentInstructions.accountNumber}
                        </strong>
                      </div>
                      <div className="bank-detail-item">
                        <span>Chủ tài khoản:</span>
                        <strong>{paymentInstructions.accountHolder}</strong>
                      </div>
                      <div className="bank-detail-item">
                        <span>Số tiền cần chuyển:</span>
                        <strong className="text-red font-bold">
                          {paymentInstructions.amount.toLocaleString("vi-VN")} đ
                        </strong>
                      </div>
                      <div className="bank-detail-item highlight-content">
                        <span>Nội dung chuyển khoản (bắt buộc):</span>
                        <strong className="transfer-code">
                          {paymentInstructions.transferContent}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {canReportPayment && onReportPayment && (
                  <div className="report-payment-box mt-3">
                    <p className="text-xs text-muted mb-2">
                      Sau khi chuyển khoản ngân hàng thành công, hãy nhấn nút
                      dưới đây để thông báo cho người bán đối soát:
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onReportPayment(order.version);
                        } catch (error) {
                          notify(error, "Chưa gửi được thông báo chuyển khoản. Thử lại sau.");
                        }
                      }}
                      disabled={isReportingPayment}
                      className="btn-primary full-width"
                    >
                      {isReportingPayment
                        ? "Đang gửi..."
                        : "Tôi đã chuyển khoản"}
                    </button>
                  </div>
                )}

                {order.paymentStatus === "REPORTED" && (
                  <div className="alert-box alert-warning text-xs mt-3">
                    <Clock size={16} />
                    <span>
                      Bạn đã thông báo chuyển khoản. Người bán sẽ kiểm tra tài
                      khoản ngân hàng và xác nhận trong ít phút.
                    </span>
                  </div>
                )}

                {order.paymentStatus === "PAID" && (
                  <div className="alert-box alert-success text-xs mt-3">
                    <CheckCircle size={16} />
                    <span>Người bán đã xác nhận nhận đủ tiền thanh toán.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cancellation Option (Only allowed at PENDING_CONTACT and UNPAID) */}
          {canCancel && onCancelOrder && (
            <div className="card">
              <h4 className="text-sm font-bold text-red mb-2">Hủy đơn hàng</h4>
              <p className="text-xs text-muted mb-3">
                Đơn đang ở trạng thái Chờ liên hệ và chưa thanh toán. Bạn có thể
                tự hủy đơn nếu không còn nhu cầu mua.
              </p>
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                disabled={isCancelling}
                className="btn-danger full-width"
              >
                Hủy đơn hàng
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Order Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Xác nhận hủy đơn hàng"
        closeDisabled={isCancelling}
      >
        <p className="text-sm text-muted mb-3">
          Vui lòng nhập lý do bạn muốn hủy đơn hàng này:
        </p>
        <textarea
          aria-label="Lý do hủy đơn hàng"
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Ví dụ: Em đổi ý không mua nữa / Đặt nhầm số lượng..."
          className="textarea-field mb-4"
        />
        <div className="modal-actions">
          <button
            type="button"
            onClick={() => setCancelModalOpen(false)}
            className="btn-secondary"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleConfirmCancel}
            disabled={isCancelling || !cancelReason.trim()}
            className="btn-danger"
          >
            {isCancelling ? "Đang hủy..." : "Xác nhận hủy đơn"}
          </button>
        </div>
      </Modal>
    </div>
  );
};
