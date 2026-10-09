import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  useCustomerOrderDetail,
  useCustomerPaymentInstructions,
  useCancelCustomerOrder,
  useReportCustomerPayment,
} from "./api";
import { OrderDetailView } from "./OrderDetailView";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";

export const CustomerOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useCustomerOrderDetail(orderId || "");

  const { data: paymentInstructions } = useCustomerPaymentInstructions(
    orderId || "",
  );
  const cancelMutation = useCancelCustomerOrder();
  const reportPaymentMutation = useReportCustomerPayment();

  if (isLoading) {
    return <LoadingSpinner message="Đang tải chi tiết đơn hàng..." />;
  }

  if (error || !order) {
    return (
      <div className="container mt-4">
        <Link to="/account/orders" className="btn-back">
          <ArrowLeft size={16} /> Quay lại danh sách đơn
        </Link>
        <ErrorMessage
          error={error || new Error("Không tìm thấy đơn hàng")}
          onRetry={refetch}
        />
      </div>
    );
  }

  const handleCancel = async (reason: string, expectedVersion: number) => {
    if (!orderId) return;
    await cancelMutation.mutateAsync({ id: orderId, reason, expectedVersion });
  };

  const handleReportPayment = async (expectedVersion: number) => {
    if (!orderId) return;
    await reportPaymentMutation.mutateAsync({ id: orderId, expectedVersion });
  };

  return (
    <div className="customer-order-detail-page container">
      <Link to="/account/orders" className="btn-back mb-4">
        <ArrowLeft size={16} /> Quay lại danh sách đơn hàng
      </Link>

      <OrderDetailView
        order={order}
        paymentInstructions={paymentInstructions}
        onCancelOrder={handleCancel}
        onReportPayment={handleReportPayment}
        isCancelling={cancelMutation.isPending}
        isReportingPayment={reportPaymentMutation.isPending}
      />
    </div>
  );
};
