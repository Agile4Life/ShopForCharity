import { notifyError as notify } from "../../components/Usability";
import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Phone,
  User,
  CheckCircle,
  XCircle,
  DollarSign,
  LoaderCircle,
} from "lucide-react";
import {
  useSellerOrderDetail,
  useSellerOrderActions,
  useSellerPickupPoints,
} from "./api";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { Modal } from "../../components/Modal";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import type { ContactChannel, ContactOutcome } from "../../types/api";
import { PickupDateTimePicker } from "./PickupDateTimePicker";
import { pickupInstant } from "./pickup-time";
import { ApiError } from "../../lib/api-client";

export const SellerOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useSellerOrderDetail(orderId || "");
  const { data: pickupPoints = [] } = useSellerPickupPoints();
  const actions = useSellerOrderActions(orderId || "");

  // Modal states
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactChannel, setContactChannel] = useState<ContactChannel>("PHONE");
  const [contactOutcome, setContactOutcome] =
    useState<ContactOutcome>("SUCCESS");
  const [contactNote, setContactNote] = useState("");

  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [acceptPickupPointId, setAcceptPickupPointId] = useState("");
  const [acceptPickupAt, setAcceptPickupAt] = useState("");
  const [acceptError, setAcceptError] = useState("");

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

  // Check if contact attempt was SUCCESS (required by spec before accept)
  const hasSuccessfulContact = order.contactAttempts?.some(
    (c) => c.outcome === "SUCCESS",
  );

  // Action Handlers
  const handleRecordContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await actions.recordContactAttempt.mutateAsync({
        channel: contactChannel,
        outcome: contactOutcome,
        note: contactNote.trim() || undefined,
        expectedVersion: order.version,
      });
    } catch (error) {
      notify(error);
      return;
    }
    setContactModalOpen(false);
    setContactNote("");
    // Refetch order to get updated version
    refetch();
  };

  const handleAcceptOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actions.acceptOrder.isPending) return;
    if (!hasSuccessfulContact) {
      setAcceptError('Cần ghi nhận liên hệ "Thành công" với khách trước khi chấp nhận đơn.');
      return;
    }
    if (!acceptPickupPointId || !acceptPickupAt) {
      setAcceptError("Vui lòng chọn điểm nhận hàng và ngày hẹn nhận.");
      return;
    }
    const instant = pickupInstant(acceptPickupAt);
    if (!Number.isFinite(instant.getTime()) || instant.getTime() <= Date.now()) {
      setAcceptError("Giờ hẹn đã qua. Vui lòng chọn thời gian trong tương lai.");
      return;
    }
    setAcceptError("");
    try {
      await actions.acceptOrder.mutateAsync({
        confirmedPickupPointId: acceptPickupPointId,
        confirmedPickupAt: instant.toISOString(),
        expectedVersion: order.version,
      });
    } catch (error) {
      if (error instanceof ApiError && ["INVALID_TRANSITION", "VERSION_CONFLICT"].includes(error.code)) {
        setAcceptModalOpen(false);
      }
      notify(error);
      return;
    }
    setAcceptModalOpen(false);
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
          <h1 className="order-code-title">{order.orderCode}</h1>
          <span className="text-xs text-muted">
            Tạo lúc: {new Date(order.createdAt).toLocaleString("vi-VN")} |
            Version: {order.version}
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
          {/* Buyer Info & Contact Attempts */}
          <div className="card mb-4">
            <div className="flex-between mb-3">
              <h2 className="section-subtitle flex items-center gap-2">
                <User size={18} /> Thông tin người mua & Liên hệ
              </h2>
              <button
                type="button"
                onClick={() => setContactModalOpen(true)}
                className="btn-primary-sm"
              >
                <Phone size={14} /> Ghi nhận liên hệ
              </button>
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
              <div>
                <strong>Email:</strong> {order.buyerEmail}
              </div>
              <div>
                <strong>Lớp / Phòng học:</strong>{" "}
                {order.buyerClass || "Không có"}
              </div>
              <div>
                <strong>Điểm hẹn ban đầu:</strong> {order.pickupPointName}
              </div>
              <div>
                <strong>Giờ mong muốn:</strong>{" "}
                {order.requestedPickupAt
                  ? new Date(order.requestedPickupAt).toLocaleString("vi-VN")
                  : "Không chọn"}
              </div>
              {order.confirmedPickupAt && (
                <div className="text-green font-bold">
                  <strong>Giờ hẹn xác nhận:</strong>{" "}
                  {new Date(order.confirmedPickupAt).toLocaleString("vi-VN")}
                </div>
              )}
              {order.note && (
                <div className="col-span-2 italic text-muted">
                  <strong>Ghi chú của khách:</strong> {order.note}
                </div>
              )}
            </div>

            {/* List of Contact Attempts */}
            <div className="contact-attempts-section mt-4 pt-3 border-top">
              <h4 className="text-sm font-bold mb-2">
                Lịch sử liên hệ ({order.contactAttempts?.length || 0}):
              </h4>
              {!order.contactAttempts || order.contactAttempts.length === 0 ? (
                <p className="text-xs text-muted">
                  Chưa ghi nhận cuộc liên hệ nào. Người bán cần liên hệ thành
                  công trước khi duyệt đơn.
                </p>
              ) : (
                <div className="contact-list">
                  {order.contactAttempts.map((attempt, idx) => (
                    <div key={idx} className="contact-attempt-row text-xs">
                      <span className="font-bold">
                        {attempt.channel === "PHONE"
                          ? "Gọi điện"
                          : attempt.channel === "EMAIL"
                            ? "Gửi email"
                            : "Gặp trực tiếp"}
                      </span>
                      <span
                        className={`badge ${
                          attempt.outcome === "SUCCESS"
                            ? "badge-green"
                            : attempt.outcome === "NO_RESPONSE"
                              ? "badge-yellow"
                              : "badge-red"
                        }`}
                      >
                        {attempt.outcome === "SUCCESS"
                          ? "Thành công"
                          : attempt.outcome === "NO_RESPONSE"
                            ? "Không nghe máy"
                            : "Thất bại"}
                      </span>
                      <span className="text-muted">
                        {new Date(attempt.createdAt).toLocaleString("vi-VN")}
                      </span>
                      {attempt.note && (
                        <span className="italic text-muted">
                          {attempt.note}
                        </span>
                      )}
                    </div>
                  ))}
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
                  <th>Tên món / Combo</th>
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

          {/* Timeline and Payment Events Log */}
          {order.paymentEvents && order.paymentEvents.length > 0 && (
            <div className="card mb-4">
              <h2 className="section-subtitle mb-3">
                Lịch sử giao dịch thanh toán
              </h2>
              <div className="payment-events-list">
                {order.paymentEvents.map((evt, idx) => (
                  <div key={idx} className="payment-event-item text-xs">
                    <span className="font-bold text-primary">{evt.type}</span>
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
            <h3 className="section-subtitle mb-3">Thao tác trạng thái đơn</h3>

            {/* PENDING_CONTACT State Actions */}
            {order.status === "PENDING_CONTACT" && (
              <div className="flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!hasSuccessfulContact) {
                      notify('Chưa thể chấp nhận đơn. Hãy chọn “Ghi nhận liên hệ” và lưu kết quả “Thành công” trước.');
                      return;
                    }
                    const matchingPoints = pickupPoints.filter(p => p.active && p.name === order.pickupPointName);
                    setAcceptPickupPointId(matchingPoints.length === 1 ? matchingPoints[0].id : "");
                    setAcceptError("");
                    setAcceptModalOpen(true);
                  }}
                  className="btn-primary full-width mb-2"
                  disabled={actions.recordContactAttempt.isPending}
                  aria-describedby={!hasSuccessfulContact ? "accept-contact-required" : undefined}
                >
                  <CheckCircle size={16} /> Chấp nhận đơn hàng
                </button>
                {!hasSuccessfulContact && (
                  <p id="accept-contact-required" className="text-sm text-muted mb-2">
                    Chọn “Ghi nhận liên hệ” và lưu kết quả “Thành công” trước khi chấp nhận đơn.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  className="btn-danger full-width"
                >
                  <XCircle size={16} /> Từ chối đơn
                </button>
              </div>
            )}

            {/* ACCEPTED State Actions */}
            {order.status === "ACCEPTED" && (
              <button
                type="button"
                onClick={() =>
                  actions.prepareOrder.mutate({
                    expectedVersion: order.version,
                  })
                }
                disabled={actions.prepareOrder.isPending}
                className="btn-primary full-width"
              >
                Chuyển sang "Đang chuẩn bị hàng"
              </button>
            )}

            {/* PREPARING State Actions */}
            {order.status === "PREPARING" && (
              <button
                type="button"
                onClick={() =>
                  actions.readyOrder.mutate({ expectedVersion: order.version })
                }
                disabled={actions.readyOrder.isPending}
                className="btn-primary full-width"
              >
                Chuyển sang "Sẵn sàng nhận"
              </button>
            )}

            {/* READY State Actions */}
            {order.status === "READY" && (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    actions.completeOrder.mutate({
                      expectedVersion: order.version,
                    })
                  }
                  disabled={
                    order.paymentStatus !== "PAID" ||
                    actions.completeOrder.isPending
                  }
                  className="btn-primary full-width"
                >
                  Bàn giao & Hoàn tất đơn
                </button>
                {order.paymentStatus !== "PAID" && (
                  <p className="text-xs text-red mt-2">
                    * Chưa thể hoàn tất: Đơn hàng cần được xác nhận thanh toán
                    (PAID) trước khi hoàn tất bàn giao.
                  </p>
                )}
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
            <p className="text-xs text-muted mb-2">
              Phương thức:{" "}
              <strong>
                {order.paymentMethod === "CASH"
                  ? "Tiền mặt"
                  : "Chuyển khoản QR"}
              </strong>
            </p>

            {/* Confirm Paid Action */}
            {["UNPAID", "REPORTED"].includes(order.paymentStatus) && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentAmount(order.total);
                    setConfirmPaymentModalOpen(true);
                  }}
                  className="btn-primary full-width"
                >
                  <DollarSign size={16} /> Xác nhận đã thu đủ tiền (PAID)
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
                  Xác nhận đã hoàn tiền đủ (REFUNDED)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}

      {/* Record Contact Modal */}
      <Modal
        isOpen={contactModalOpen}
        closeDisabled={actions.recordContactAttempt.isPending}
        onClose={() => setContactModalOpen(false)}
        title="Ghi nhận liên hệ khách hàng"
      >
        <form onSubmit={handleRecordContact}>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-1"
            >
              Kênh liên hệ:
            </label>
            <select
              id="sellerorderdetailpage-field-1"
              value={contactChannel}
              onChange={(e) =>
                setContactChannel(e.target.value as ContactChannel)
              }
              className="select-field"
            >
              <option value="PHONE">Gọi điện thoại</option>
              <option value="EMAIL">Gửi Email</option>
              <option value="IN_PERSON">Gặp trực tiếp tại trường</option>
            </select>
          </div>

          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-2"
            >
              Kết quả liên hệ:
            </label>
            <select
              id="sellerorderdetailpage-field-2"
              value={contactOutcome}
              onChange={(e) =>
                setContactOutcome(e.target.value as ContactOutcome)
              }
              className="select-field"
            >
              <option value="SUCCESS">
                Thành công (Đã thỏa thuận điểm và giờ nhận)
              </option>
              <option value="NO_RESPONSE">
                Không nghe máy / Không trả lời
              </option>
              <option value="FAILED">Thất bại / Không liên lạc được</option>
            </select>
          </div>

          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-3"
            >
              Ghi chú cuộc gọi:
            </label>
            <textarea
              id="sellerorderdetailpage-field-3"
              rows={2}
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              placeholder="Ví dụ: Bạn hẹn nhận vào giờ ra chơi tiết 2 tại cổng thư viện..."
              className="textarea-field"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setContactModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.recordContactAttempt.isPending}
              className="btn-primary"
            >
              Lưu liên hệ
            </button>
          </div>
        </form>
      </Modal>

      {/* Accept Order Modal */}
      <Modal
        isOpen={acceptModalOpen}
        onClose={() => { setAcceptModalOpen(false); setAcceptError(""); }}
        title="Chấp nhận đơn hàng"
        className="pickup-schedule-dialog"
        closeDisabled={actions.acceptOrder.isPending}
      >
        <form onSubmit={handleAcceptOrder}>
          <p className="pickup-schedule-intro">Chốt điểm nhận và thời gian đã thống nhất với khách.</p>
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerorderdetailpage-field-4"
            >
              Điểm nhận hàng
            </label>
            <select
              id="sellerorderdetailpage-field-4"
              value={acceptPickupPointId}
              onChange={(e) => { setAcceptPickupPointId(e.target.value); setAcceptError(""); }}
              className="select-field"
              disabled={actions.acceptOrder.isPending}
              data-autofocus
              required
            >
              <option value="">-- Chọn điểm nhận --</option>
              {pickupPoints.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <PickupDateTimePicker value={acceptPickupAt}
            onChange={(value) => { setAcceptPickupAt(value); setAcceptError(""); }}
            disabled={actions.acceptOrder.isPending} invalid={!!acceptError} errorId="pickup-schedule-error" />
          {acceptError && <p id="pickup-schedule-error" className="pickup-schedule-error" role="alert">{acceptError}</p>}
          {!pickupPoints.some(p => p.active) && <p className="pickup-schedule-error">Chưa có điểm nhận đang hoạt động. <Link to="/seller/settings">Thêm điểm nhận hàng</Link></p>}

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setAcceptModalOpen(false)}
              className="btn-secondary"
              disabled={actions.acceptOrder.isPending}
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={actions.acceptOrder.isPending || !hasSuccessfulContact || !pickupPoints.some(p => p.active)}
              className="btn-primary"
            >
              {actions.acceptOrder.isPending && <LoaderCircle size={18} className="pickup-saving-icon" aria-hidden="true" />}
              {actions.acceptOrder.isPending ? "Đang xác nhận…" : "Xác nhận duyệt đơn"}
            </button>
          </div>
        </form>
      </Modal>

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
        title="Xác nhận thanh toán đủ (PAID)"
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
              Xác nhận PAID
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
              Bác báo cáo về UNPAID
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
