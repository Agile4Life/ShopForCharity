import { notifyError as notify } from "../../components/Usability";
import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  User,
  CheckCircle,
  XCircle,
  DollarSign,
  LoaderCircle,
} from "lucide-react";
import {
  useSellerOrderDetail,
  useSellerOrderActions,
} from "./api";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { Modal } from "../../components/Modal";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { OrderCode, CopyOrderCode } from "../../components/OrderCode";
import { AUDIT_ACTION_LABELS } from "./audit-display";

export const SellerOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useSellerOrderDetail(orderId || "");
  const actions = useSellerOrderActions(orderId || "");

  // Modal states
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [confirmPaymentModalOpen, setConfirmPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentBankRef, setPaymentBankRef] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [dismissPaymentModalOpen, setDismissPaymentModalOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  const [confirmRefundModalOpen, setConfirmRefundModalOpen] = useState(false);
  const [refundBankRef, setRefundBankRef] = useState("");
  const [refundNote, setRefundNote] = useState("");

  if (isLoading) {
    return <LoadingSpinner message="Đang tải chi tiết đơn hàng..." />;
  }

  if (!order) {
    return (
      <div className="container mt-4">
        <Link to="/seller/orders" className="btn-back">
          <ArrowLeft size={16} /> Quay lại danh sách đơn
        </Link>
        <ErrorMessage
          error={error || new Error("Không tìm thấy đơn hàng")}
          onRetry={refetch}
        />
      </div>
    );
  }

  const isResolved = ["ACCEPTED", "PREPARING", "READY", "COMPLETED"].includes(order.status);

  // Action Handlers
  const handleAcceptOrder = async () => {
    if (actions.acceptOrder.isPending) return;
    try {
      await actions.acceptOrder.mutateAsync({
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
    }
  };

  const handleRejectOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      notify("Vui lòng nhập lý do từ chối đơn");
      return;
    }
    try {
      await actions.rejectOrder.mutateAsync({
        reason: rejectReason.trim(),
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
      return;
    }
    setRejectModalOpen(false);
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      notify("Vui lòng nhập lý do hủy đơn");
      return;
    }
    try {
      await actions.cancelOrder.mutateAsync({
        reason: cancelReason.trim(),
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
      return;
    }
    setCancelModalOpen(false);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentAmount <= 0) {
      notify("Vui lòng nhập số tiền thực nhận hợp lệ");
      return;
    }
    try {
      await actions.confirmPayment.mutateAsync({
        amount: paymentAmount,
        bankReference: paymentBankRef.trim() || undefined,
        note: paymentNote.trim() || undefined,
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
      return;
    }
    setConfirmPaymentModalOpen(false);
  };

  const handleDismissPaymentReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) {
      notify("Vui lòng nhập lý do không nhận được tiền");
      return;
    }
    try {
      await actions.dismissPaymentReport.mutateAsync({
        reason: dismissReason.trim(),
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
      return;
    }
    setDismissPaymentModalOpen(false);
  };

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await actions.confirmRefund.mutateAsync({
        amount: order.receivedAmount,
        bankReference: refundBankRef.trim() || undefined,
        note: refundNote.trim() || undefined,
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
      return;
    }
    setConfirmRefundModalOpen(false);
  };

  return (
    <div className="seller-order-detail-page container">
      <Link to="/seller/orders" className="btn-back mb-4">
        <ArrowLeft size={16} /> Quay lại danh sách đơn hàng
      </Link>

      <div className="order-detail-header card flex-between mb-4">
        <div>
          <span className="text-xs text-muted">Mã đơn hàng:</span>
          <h1 className="order-code-title"><OrderCode value={order.orderCode} /></h1>
          <CopyOrderCode value={order.orderCode} />
          <span className="text-xs text-muted">
            Tạo lúc: {new Date(order.createdAt).toLocaleString("vi-VN")}
          </span>
        </div>

        <div className="flex gap-2">
          <div>
            <span className="text-xs text-muted block mb-1">Trạng thái:</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <div>
            <span className="text-xs text-muted block mb-1">Thanh toán:</span>
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
      </div>

      <div className="seller-order-grid">
        {/* Main Column */}
        <div className="seller-main-col">
          {/* Buyer Info */}
          <div className="card mb-4">
            <div className="flex-between mb-3">
              <h2 className="section-subtitle flex items-center gap-2">
                <User size={18} /> Thông tin người mua
              </h2>
            </div>

            <div className="buyer-info-grid">
              <div>
                <strong>Họ và tên:</strong> {order.buyerName}
              </div>
              <div>
                <strong>Điện thoại:</strong>{" "}
                <a
                  href={`tel:${order.buyerPhone}`}
                  className="text-primary font-bold"
                >
                  {order.buyerPhone}
                </a>
              </div>
              {order.buyerEmail && (
                <div>
                  <strong>Email:</strong> {order.buyerEmail}
                </div>
              )}
              <div>
                <strong>Lớp / Phòng học:</strong>{" "}
                {order.buyerClass || "Không có"}
              </div>
              <div>
                <strong>Người giới thiệu:</strong>{" "}
                {order.referrer || "Không có"}
              </div>
              <div>
                <strong>Địa điểm nhận hàng:</strong> {order.pickupPointName}
              </div>
              {order.pickupInstructions && <div><strong>Chỉ dẫn nhận hàng:</strong> {order.pickupInstructions}</div>}
              {order.note && (
                <div className="col-span-2 italic text-muted">
                  <strong>Ghi chú của khách:</strong> {order.note}
                </div>
              )}
            </div>
          </div>

          {/* Order Items Table */}
          <div className="card mb-4">
            <h2 className="section-subtitle mb-3">Món đã đặt</h2>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Tên sản phẩm</th>
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

          {/* Timeline and Payment Events Log */}
          {order.paymentEvents && order.paymentEvents.length > 0 && (
            <div className="card mb-4">
              <h2 className="section-subtitle mb-3">
                Lịch sử giao dịch thanh toán
              </h2>
              <div className="payment-events-list">
                {order.paymentEvents.map((evt, idx) => (
                  <div key={idx} className="payment-event-item text-xs">
                    <span className="font-bold text-primary">{AUDIT_ACTION_LABELS[evt.type] ?? "Cập nhật thanh toán"}</span>
                    <span>
                      {evt.amount
                        ? `${evt.amount.toLocaleString("vi-VN")} đ`
                        : ""}
                    </span>
                    {evt.bankReference && (
                      <span>Mã GD: {evt.bankReference}</span>
                    )}
                    <span className="text-muted">
                      {new Date(evt.createdAt).toLocaleString("vi-VN")}
                    </span>
                    {evt.note && <span className="italic">{evt.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Actions Column */}
        <div className="seller-sidebar-col">
          {/* Order Actions Card */}
          <div className="card mb-4">
            <h3 className="section-subtitle mb-3">Xử lý đơn hàng</h3>

            {/* PENDING_CONTACT State Actions */}
            {order.status === "PENDING_CONTACT" && (
              <div className="flex-col gap-2">
                <button
                  type="button"
                  onClick={handleAcceptOrder}
                  className="btn-primary full-width mb-2"
                  disabled={actions.acceptOrder.isPending}
                >
                  {actions.acceptOrder.isPending ? (
                    <LoaderCircle size={16} className="pickup-saving-icon" aria-hidden="true" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  {actions.acceptOrder.isPending ? "Đang xác nhận…" : "Xác nhận đơn hàng"}
                </button>

                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  className="btn-danger full-width"
                >
                  <XCircle size={16} /> Từ chối đơn
                </button>
              </div>
            )}

            {isResolved && (
              <div className="seller-confirmation-summary" role="status">
                <div className="flex items-center gap-2 text-green mb-2">
                  <CheckCircle size={18} aria-hidden="true" />
                  <strong>Đã xử lý xong</strong>
                </div>
                <p className="text-sm mb-3">Đơn đã được xác nhận thành công.</p>
                <Link to="/seller/orders?status=ACCEPTED" className="btn-secondary full-width mt-3">Xem các đơn đã xác nhận</Link>
              </div>
            )}

            {/* General Cancellation (Before COMPLETED) */}
            {!["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(
              order.status,
            ) && (
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className="btn-danger-outline full-width mt-3"
              >
                Hủy đơn hàng này
              </button>
            )}
          </div>

          {/* Payment Reconciliation Actions */}
          <div className="card mb-4">
            <h3 className="section-subtitle mb-3">Đối soát thanh toán</h3>
            {isResolved && <p className="text-xs text-muted mb-3">Ghi nhận tiền khi thực nhận. Việc này không cần chuyển trạng thái đơn.</p>}
            <p className="text-xs text-muted mb-2">
              Phương thức:{" "}
              <strong>
                {order.paymentMethod === "CASH"
                  ? "Tiền mặt"
                  : "Chuyển khoản QR"}
              </strong>
            </p>

            {/* Confirm Paid Action */}
            {["UNPAID", "REPORTED"].includes(order.paymentStatus) &&
              !["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(order.status) && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentAmount(order.total);
                    setConfirmPaymentModalOpen(true);
                  }}
                  className="btn-primary full-width"
                >
                  <DollarSign size={16} /> Xác nhận đã thu đủ tiền
                </button>
              </div>
            )}

            {/* Dismiss Report Action */}
            {order.paymentStatus === "REPORTED" && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setDismissPaymentModalOpen(true)}
                  className="btn-secondary full-width"
                >
                  Bác bỏ báo cáo chuyển khoản (Chưa có tiền)
                </button>
              </div>
            )}

            {/* Confirm Refund Action */}
            {order.paymentStatus === "REFUND_PENDING" && (
              <div>
                <div className="alert-box alert-warning text-xs mb-2">
                  Đơn đã hủy/từ chối nhưng đã thu tiền trước. Cần hoàn trả tiền
                  cho khách!
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmRefundModalOpen(true)}
                  className="btn-primary full-width"
                >
                  Ghi nhận hoàn tiền
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}

      {/* Reject Order Modal */}
      <Modal
        isOpen={rejectModalOpen}
        closeDisabled={actions.rejectOrder.isPending}
        onClose={() => setRejectModalOpen(false)}
        title="Từ chối đơn hàng"
      >
        <form onSubmit={handleRejectOrder}>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-6"
            >
              Lý do từ chối (bắt buộc):
            </label>
            <textarea
              id="sellerorderdetailpage-field-6"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Không thể liên hệ được với người mua / Hết giờ giao dịch hôm nay..."
              className="textarea-field"
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setRejectModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.rejectOrder.isPending}
              className="btn-danger"
            >
              Từ chối đơn
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Order Modal */}
      <Modal
        isOpen={cancelModalOpen}
        closeDisabled={actions.cancelOrder.isPending}
        onClose={() => setCancelModalOpen(false)}
        title="Hủy đơn hàng"
      >
        <form onSubmit={handleCancelOrder}>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-7"
            >
              Lý do hủy đơn (bắt buộc):
            </label>
            <textarea
              id="sellerorderdetailpage-field-7"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Nhập lý do hủy..."
              className="textarea-field"
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setCancelModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.cancelOrder.isPending}
              className="btn-danger"
            >
              Xác nhận hủy
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Payment Modal */}
      <Modal
        isOpen={confirmPaymentModalOpen}
        closeDisabled={actions.confirmPayment.isPending}
        onClose={() => setConfirmPaymentModalOpen(false)}
        title="Xác nhận đã thu đủ tiền"
      >
        <form onSubmit={handleConfirmPayment}>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-8"
            >
              Số tiền thực nhận (VND) *:
            </label>
            <input
              id="sellerorderdetailpage-field-8"
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-9"
            >
              Mã tham chiếu ngân hàng (nếu có):
            </label>
            <input
              id="sellerorderdetailpage-field-9"
              type="text"
              value={paymentBankRef}
              onChange={(e) => setPaymentBankRef(e.target.value)}
              placeholder="FT123456789..."
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-10"
            >
              Ghi chú đối soát:
            </label>
            <textarea
              id="sellerorderdetailpage-field-10"
              rows={2}
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="Ghi chú thêm..."
              className="textarea-field"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setConfirmPaymentModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.confirmPayment.isPending}
              className="btn-primary"
            >
              Xác nhận thanh toán
            </button>
          </div>
        </form>
      </Modal>

      {/* Dismiss Payment Report Modal */}
      <Modal
        isOpen={dismissPaymentModalOpen}
        closeDisabled={actions.dismissPaymentReport.isPending}
        onClose={() => setDismissPaymentModalOpen(false)}
        title="Bác bỏ báo cáo chuyển khoản"
      >
        <form onSubmit={handleDismissPaymentReport}>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-11"
            >
              Lý do không tìm thấy tiền (bắt buộc):
            </label>
            <textarea
              id="sellerorderdetailpage-field-11"
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Ví dụ: Đã kiểm tra sao kê nhưng chưa có biến động số dư..."
              className="textarea-field"
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setDismissPaymentModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.dismissPaymentReport.isPending}
              className="btn-danger"
            >
              Xác nhận chưa nhận được tiền
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Refund Modal */}
      <Modal
        isOpen={confirmRefundModalOpen}
        closeDisabled={actions.confirmRefund.isPending}
        onClose={() => setConfirmRefundModalOpen(false)}
        title="Xác nhận hoàn tiền cho khách"
      >
        <form onSubmit={handleConfirmRefund}>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-12"
            >
              Mã giao dịch hoàn tiền:
            </label>
            <input
              id="sellerorderdetailpage-field-12"
              type="text"
              value={refundBankRef}
              onChange={(e) => setRefundBankRef(e.target.value)}
              placeholder="Mã giao dịch ngân hàng đã chuyển trả..."
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-13"
            >
              Ghi chú:
            </label>
            <textarea
              id="sellerorderdetailpage-field-13"
              rows={2}
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              placeholder="Đã hoàn lại tiền..."
              className="textarea-field"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setConfirmRefundModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.confirmRefund.isPending}
              className="btn-primary"
            >
              Xác nhận đã hoàn đủ tiền
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
