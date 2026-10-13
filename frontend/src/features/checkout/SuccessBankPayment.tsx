import { useQuery } from "@tanstack/react-query";
import type { CreateOrderResponse, OrderDetail } from "../../types/api";
import { BankTransferDetails } from "../../components/BankTransferDetails";
import { ErrorMessage } from "../../components/ErrorMessage";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { notifyError } from "../../components/Usability";
import {
  accessGuestOrder, useGuestOrderDetail, useCustomerOrderDetail,
  useGuestPaymentInstructions, useCustomerPaymentInstructions,
  useReportGuestPayment, useReportCustomerPayment,
} from "../orders/api";

export function SuccessBankPayment({ order, onOrderUpdated }: {
  order: CreateOrderResponse;
  onOrderUpdated: (order: OrderDetail) => void;
}) {
  const guest = !!order.guestAccessToken;
  const access = useQuery({
    queryKey: ["checkout-guest-access", order.orderId],
    queryFn: () => accessGuestOrder(order.orderCode, order.guestAccessToken!),
    enabled: guest,
    staleTime: Infinity,
  });
  const guestOrder = useGuestOrderDetail(guest ? order.orderCode : "", access.isSuccess);
  const customerOrder = useCustomerOrderDetail(guest ? "" : order.orderId);
  const guestPayment = useGuestPaymentInstructions(guest ? order.orderCode : "", access.isSuccess);
  const customerPayment = useCustomerPaymentInstructions(guest ? "" : order.orderId);
  const reportGuest = useReportGuestPayment();
  const reportCustomer = useReportCustomerPayment();
  const detail = guest ? guestOrder : customerOrder;
  const payment = guest ? guestPayment : customerPayment;
  const instructions = payment.data;
  const current = detail.data;
  const error = (guest ? access.error : null) ?? payment.error ?? detail.error;
  const reporting = reportGuest.isPending || reportCustomer.isPending;
  const retry = () => {
    if (guest && !access.isSuccess) void access.refetch();
    else { void payment.refetch(); void detail.refetch(); }
  };
  const report = async () => {
    if (!current || reporting) return;
    try {
      const updated = guest
        ? await reportGuest.mutateAsync({ orderCode: order.orderCode, expectedVersion: current.version })
        : await reportCustomer.mutateAsync({ id: order.orderId, expectedVersion: current.version });
      onOrderUpdated(updated);
    } catch (error) {
      notifyError(error, "Chưa gửi được thông báo chuyển khoản. Thử lại sau.");
    }
  };
  return (
    <div className="bank-transfer-box mt-3">
      {error ? <ErrorMessage error={error} onRetry={retry} /> : !instructions && <LoadingSpinner message="Đang tải thông tin chuyển khoản…" />}
      {instructions && <BankTransferDetails bank={instructions} amount={instructions.amount}
        transferContent={instructions.transferContent} qrSignedUrl={instructions.qrSignedUrl} onRetry={retry} />}
      <p className="text-muted text-sm mt-3">Chuyển khoản đúng số tiền và nội dung mã đơn. Shop sẽ kiểm tra tiền và xác nhận đơn hàng sau.</p>
      {current?.paymentStatus === "UNPAID" && ["PENDING_CONTACT", "ACCEPTED", "PREPARING", "READY"].includes(current.status) && (
        <button type="button" className="btn-primary full-width mt-3" disabled={reporting || !instructions}
          onClick={report}>{reporting ? "Đang gửi..." : "Tôi đã chuyển khoản"}</button>
      )}
      {current?.paymentStatus === "REPORTED" && <p className="alert-box alert-warning text-sm mt-3" role="status">Đã báo chuyển khoản. Đơn hàng chờ shop kiểm tra tiền và xác nhận.</p>}
      {current?.paymentStatus === "PAID" && <p className="alert-box alert-success text-sm mt-3" role="status">Shop đã xác nhận nhận đủ tiền thanh toán.</p>}
    </div>
  );
}
