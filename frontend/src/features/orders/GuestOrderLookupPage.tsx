import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Key, ArrowLeft } from "lucide-react";
import {
  accessGuestOrder,
  useGuestOrderDetail,
  useGuestPaymentInstructions,
  useCancelGuestOrder,
  useReportGuestPayment,
} from "./api";
import { OrderDetailView } from "./OrderDetailView";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";

export const GuestOrderLookupPage: React.FC = () => {
  const { state } = useLocation();
  const credentials = state as {
    orderCode?: string;
    guestToken?: string;
  } | null;
  const [orderCodeInput, setOrderCodeInput] = useState(
    credentials?.orderCode || "",
  );
  const [guestTokenInput, setGuestTokenInput] = useState(
    credentials?.guestToken || "",
  );
  const [currentOrderCode, setCurrentOrderCode] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<unknown | null>(null);

  const {
    data: order,
    isLoading: orderLoading,
    error: orderError,
    refetch: refetchOrder,
  } = useGuestOrderDetail(currentOrderCode || "", !!currentOrderCode);

  const { data: paymentInstructions } = useGuestPaymentInstructions(
    currentOrderCode || "",
    !!currentOrderCode && order?.paymentMethod === "BANK_TRANSFER",
  );

  const cancelMutation = useCancelGuestOrder();
  const reportPaymentMutation = useReportGuestPayment();

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderCodeInput.trim() || !guestTokenInput.trim()) {
      setAccessError(new Error("Vui lòng nhập mã đơn hàng và khóa truy cập."));
      return;
    }

    setAccessLoading(true);
    setAccessError(null);
    try {
      await accessGuestOrder(orderCodeInput.trim(), guestTokenInput.trim());
      setCurrentOrderCode(orderCodeInput.trim());
    } catch (err) {
      setAccessError(err);
    } finally {
      setAccessLoading(false);
    }
  };

  const handleCancel = async (reason: string, expectedVersion: number) => {
    if (!currentOrderCode) return;
    await cancelMutation.mutateAsync({
      orderCode: currentOrderCode,
      reason,
      expectedVersion,
    });
  };

  const handleReportPayment = async (expectedVersion: number) => {
    if (!currentOrderCode) return;
    await reportPaymentMutation.mutateAsync({
      orderCode: currentOrderCode,
      expectedVersion,
    });
  };

  return (
    <div className="guest-order-page container">
      {!currentOrderCode ? (
        <div className="lookup-card card max-w-md mx-auto">
          <div className="lookup-icon-wrap">
            <Key size={36} className="text-primary" />
          </div>
          <h1 className="lookup-title">Tra cứu đơn hàng</h1>
          <p className="lookup-desc text-muted text-sm">
            Nhập mã đơn và khóa truy cập nhận được sau khi đặt hàng.
          </p>

          {accessError != null && (
            <div className="mb-4">
              <ErrorMessage error={accessError} />
            </div>
          )}

          <form onSubmit={handleLookup} className="lookup-form">
            <div className="form-group">
              <label htmlFor="orderCode" className="form-label">
                Mã đơn hàng *
              </label>
              <input
                id="orderCode"
                type="text"
                placeholder="Ví dụ: ORD-123456"
                value={orderCodeInput}
                onChange={(e) => setOrderCodeInput(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="guestToken" className="form-label">
                Khóa truy cập bí mật *
              </label>
              <input
                id="guestToken"
                type="password"
                placeholder="Dán mã khóa truy cập tại đây"
                value={guestTokenInput}
                onChange={(e) => setGuestTokenInput(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={accessLoading}
              className="btn-primary full-width mt-4"
            >
              {accessLoading ? (
                "Đang kiểm tra quyền truy cập..."
              ) : (
                <>
                  <Search size={18} /> Tra cứu đơn hàng
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setCurrentOrderCode(null)}
            className="btn-back mb-4"
          >
            <ArrowLeft size={16} /> Tra cứu đơn khác
          </button>

          {orderLoading ? (
            <LoadingSpinner message="Đang tải dữ liệu đơn hàng..." />
          ) : orderError ? (
            <ErrorMessage error={orderError} onRetry={refetchOrder} />
          ) : order ? (
            <OrderDetailView
              order={order}
              paymentInstructions={paymentInstructions}
              onCancelOrder={handleCancel}
              onReportPayment={handleReportPayment}
              isCancelling={cancelMutation.isPending}
              isReportingPayment={reportPaymentMutation.isPending}
            />
          ) : null}
        </div>
      )}
    </div>
  );
};
