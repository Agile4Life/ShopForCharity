import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  ShieldCheck,
  Clock,
  CreditCard,
  Banknote,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useCart } from "../cart/cart-context";
import { useAuth } from "../auth/auth-context";
import { useShopInfo } from "../catalog/api";
import { useCheckoutQuote, useCreateOrder, createGuestSession } from "./api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { PurchaseSteps } from "../../components/Usability";
import type { QuoteResponse, PaymentMethod } from "../../types/api";

const checkoutSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Họ và tên phải có ít nhất 2 ký tự")
    .max(100, "Họ và tên tối đa 100 ký tự"),
  phone: z
    .string()
    .trim()
    .regex(
      /^(0|\+84)[35789][0-9]{8}$/,
      "Nhập số điện thoại Việt Nam hợp lệ, ví dụ 0912345678.",
    ),
  email: z
    .string()
    .trim()
    .email("Địa chỉ email không đúng định dạng")
    .max(254, "Email tối đa 254 ký tự"),
  className: z.string().max(50, "Lớp học tối đa 50 ký tự").optional(),
  pickupPointId: z
    .string()
    .min(1, "Vui lòng chọn địa điểm nhận hàng tại trường"),
  requestedPickupAt: z
    .string()
    .optional()
    .refine(
      (value) => !value || new Date(value).getTime() > Date.now(),
      "Chọn thời gian nhận trong tương lai.",
    ),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER"] as const),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự").optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export const CheckoutPage: React.FC = () => {
  const { items, clearCart } = useCart();
  const { isAuthenticated, profile } = useAuth();
  const {
    data: shop,
    isLoading: shopLoading,
    error: shopError,
    refetch: refetchShop,
  } = useShopInfo();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<unknown | null>(null);
  const [submitError, setSubmitError] = useState<unknown | null>(null);
  const [checkingQuote, setCheckingQuote] = useState(false);
  const [now, setNow] = useState(Date.now());
  const requestId = useRef(0);
  const orderCreated = useRef(false);

  const quoteMutation = useCheckoutQuote();
  const orderMutation = useCreateOrder();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getFieldState,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: profile?.fullName || "",
      phone: profile?.phone || "",
      email: profile?.email || "",
      className: "",
      pickupPointId: "",
      paymentMethod: "CASH",
      note: "",
    },
  });

  const selectedPaymentMethod = watch("paymentMethod");
  const selectedPickup = watch("pickupPointId");
  const quoteExpired = !!quote && new Date(quote.expiresAt).getTime() <= now;
  const unavailableItems =
    quote?.items.some(
      (item) => !item.isAvailable || item.availableStock < item.quantity,
    ) ?? false;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const points = shop?.pickupPoints.filter((point) => point.active) || [];
    if (points.length === 1 && !selectedPickup)
      setValue("pickupPointId", points[0].id);
  }, [shop, selectedPickup, setValue]);

  // Pre-fill profile info if customer is logged in
  useEffect(() => {
    if (profile) {
      if (profile.fullName && !getFieldState("fullName").isDirty)
        setValue("fullName", profile.fullName);
      if (profile.phone && !getFieldState("phone").isDirty)
        setValue("phone", profile.phone);
      if (profile.email && !getFieldState("email").isDirty)
        setValue("email", profile.email);
    }
  }, [profile, setValue, getFieldState]);

  // Request Quote on Mount or when items change
  const fetchQuote = async () => {
    if (items.length === 0) return;
    const id = ++requestId.current;
    setCheckingQuote(true);
    setQuoteError(null);
    try {
      // Ensure guest session cookie is issued if guest
      if (!isAuthenticated) {
        await createGuestSession();
      }

      const res = await quoteMutation.mutateAsync({
        items: items.map((i) => ({
          kind: i.kind,
          catalogId: i.catalogId,
          quantity: i.quantity,
        })),
        paymentMethod: selectedPaymentMethod as PaymentMethod,
      });
      if (id === requestId.current) {
        setQuote(res);
        setNow(Date.now());
      }
    } catch (err) {
      if (id === requestId.current) {
        setQuote(null);
        setQuoteError(err);
      }
    } finally {
      if (id === requestId.current) setCheckingQuote(false);
    }
  };

  useEffect(() => {
    if (items.length === 0) {
      if (!orderCreated.current) navigate("/cart");
      return;
    }
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedPaymentMethod, isAuthenticated]);

  const onSubmit = async (data: CheckoutFormData) => {
    if (
      !quote ||
      checkingQuote ||
      quoteExpired ||
      unavailableItems ||
      !shop?.acceptingOrders
    ) {
      setSubmitError(
        new Error(
          "Kiểm tra giá, số lượng và trạng thái shop trước khi đặt hàng.",
        ),
      );
      return;
    }

    setSubmitError(null);
    try {
      const orderPayload = {
        quoteToken: quote.quoteToken,
        items: items.map((i) => ({
          kind: i.kind,
          catalogId: i.catalogId,
          quantity: i.quantity,
        })),
        buyer: {
          fullName: data.fullName,
          phone: data.phone,
          email: data.email,
          className: data.className || undefined,
        },
        pickupPointId: data.pickupPointId,
        requestedPickupAt: data.requestedPickupAt
          ? new Date(data.requestedPickupAt).toISOString()
          : undefined,
        paymentMethod: data.paymentMethod as PaymentMethod,
        note: data.note || undefined,
      };

      const result = await orderMutation.mutateAsync(orderPayload);
      orderCreated.current = true;
      clearCart();
      navigate("/order-success", {
        state: {
          order: result,
          buyer: orderPayload.buyer,
          pickupPoint: shop?.pickupPoints.find(
            (p) => p.id === data.pickupPointId,
          )?.name,
          paymentMethod: data.paymentMethod,
        },
      });
    } catch (err: any) {
      if (err?.status === 409 || err?.code === "CHECKOUT_CHANGED") {
        // Stale quote or catalog changes -> automatically refresh quote and alert user
        await fetchQuote();
        setSubmitError(
          new Error(
            "Giá hoặc số lượng vừa thay đổi. Kiểm tra lại đơn trước khi đặt hàng.",
          ),
        );
      } else {
        setSubmitError(err);
      }
    }
  };

  if (shopLoading) {
    return <LoadingSpinner message="Đang tải thông tin đặt hàng…" />;
  }

  const pickupPoints = shop?.pickupPoints.filter((p) => p.active) || [];

  return (
    <div className="checkout-page container">
      <PurchaseSteps step={2} />
      <h1 className="page-title">Đặt hàng</h1>
      {!isAuthenticated && (
        <p className="guest-checkout-hint">
          Đặt hàng không cần tài khoản.{" "}
          <Link to="/login" state={{ from: { pathname: "/checkout" } }}>
            Đăng nhập
          </Link>
        </p>
      )}
      {shopError && <ErrorMessage error={shopError} onRetry={refetchShop} />}

      {shop && !shop.acceptingOrders && (
        <div className="shop-closed-alert mb-4">
          <AlertCircle size={20} />
          <strong>
            Shop tạm dừng nhận đơn. Giỏ hàng của bạn vẫn được lưu.
          </strong>
        </div>
      )}

      {quoteError != null && (
        <div className="mb-4">
          <ErrorMessage error={quoteError} onRetry={fetchQuote} />
        </div>
      )}

      {submitError != null && (
        <div className="mb-4">
          <ErrorMessage error={submitError} />
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="checkout-layout"
        noValidate
      >
        {/* Buyer Information Form */}
        <div className="checkout-form-section card">
          <h2 className="section-subtitle">Thông tin người mua</h2>
          <p className="text-muted text-xs mb-3">
            Người bán dùng thông tin này để xác nhận đơn.
          </p>
          {Object.keys(errors).length > 0 && (
            <div className="validation-summary" role="alert">
              <strong>Kiểm tra thông tin còn thiếu</strong>
              {Object.entries(errors).map(([field, error]) => (
                <button
                  type="button"
                  key={field}
                  onClick={() => setFocus(field as keyof CheckoutFormData)}
                >
                  {error?.message}
                </button>
              ))}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="fullName" className="form-label">
              Họ và tên *
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              placeholder="Ví dụ: Nguyễn Văn A"
              className={`input-field ${errors.fullName ? "input-error" : ""}`}
              {...register("fullName")}
            />
            {errors.fullName && (
              <span id="fullName-error" className="field-error">
                {errors.fullName.message}
              </span>
            )}
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="phone" className="form-label">
                Số điện thoại liên hệ *
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? "phone-error" : undefined}
                placeholder="Ví dụ: 0912345678"
                className={`input-field ${errors.phone ? "input-error" : ""}`}
                {...register("phone")}
              />
              {errors.phone && (
                <span id="phone-error" className="field-error">
                  {errors.phone.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Địa chỉ Email *
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                placeholder="Ví dụ: hocsinh@gmail.com"
                className={`input-field ${errors.email ? "input-error" : ""}`}
                {...register("email")}
              />
              {errors.email && (
                <span id="email-error" className="field-error">
                  {errors.email.message}
                </span>
              )}
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="pickupPointId" className="form-label">
                Điểm nhận hàng *
              </label>
              <select
                id="pickupPointId"
                aria-invalid={!!errors.pickupPointId}
                aria-describedby={
                  errors.pickupPointId ? "pickup-error" : undefined
                }
                className={`select-field ${errors.pickupPointId ? "input-error" : ""}`}
                {...register("pickupPointId")}
              >
                <option value="">Chọn điểm nhận</option>
                {pickupPoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.pickupPointId && (
                <span id="pickup-error" className="field-error">
                  {errors.pickupPointId.message}
                </span>
              )}
              {shop?.pickupPoints.find((point) => point.id === selectedPickup)
                ?.instructions && (
                <p className="pickup-instructions">
                  {
                    shop.pickupPoints.find(
                      (point) => point.id === selectedPickup,
                    )?.instructions
                  }
                </p>
              )}
              {pickupPoints.length === 0 && (
                <p className="field-error">
                  Chưa có điểm nhận. Shop cần bổ sung trước khi bạn đặt hàng.
                </p>
              )}
            </div>
          </div>

          <details
            className="optional-fields"
            open={
              errors.requestedPickupAt || errors.className || errors.note
                ? true
                : undefined
            }
          >
            <summary>Thêm lớp, thời gian nhận hoặc ghi chú</summary>
            <div className="form-group">
              <label htmlFor="className" className="form-label">
                Lớp (tùy chọn)
              </label>
              <input
                id="className"
                className="input-field"
                placeholder="Ví dụ: 12A1"
                aria-invalid={!!errors.className}
                {...register("className")}
              />
              {errors.className && (
                <span className="field-error">{errors.className.message}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="requestedPickupAt" className="form-label">
                Thời gian muốn nhận (tùy chọn)
              </label>
              <input
                id="requestedPickupAt"
                type="datetime-local"
                aria-invalid={!!errors.requestedPickupAt}
                aria-describedby={
                  errors.requestedPickupAt ? "pickup-time-error" : undefined
                }
                className="input-field"
                {...register("requestedPickupAt")}
              />
              {errors.requestedPickupAt && (
                <span id="pickup-time-error" className="field-error">
                  {errors.requestedPickupAt.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="note" className="form-label">
                Ghi chú (tùy chọn)
              </label>
              <textarea
                id="note"
                rows={2}
                placeholder="Ví dụ: Em nhận vào giờ ra chơi tiết 2 ạ..."
                className="textarea-field"
                aria-invalid={!!errors.note}
                {...register("note")}
              />
              {errors.note && (
                <span className="field-error">{errors.note.message}</span>
              )}
            </div>
          </details>
          {/* Payment Method Selection */}
          <div className="form-group mt-4">
            <label className="form-label font-bold">
              Phương thức thanh toán:
            </label>
            <div className="payment-options-grid">
              <label className="payment-radio-card">
                <input
                  type="radio"
                  value="CASH"
                  {...register("paymentMethod")}
                />
                <div className="payment-card-content">
                  <Banknote className="payment-icon text-green" size={24} />
                  <div>
                    <strong>Tiền mặt khi nhận hàng</strong>
                    <p className="text-muted text-xs">
                      Trả tiền trực tiếp cho người bán khi nhận hàng.
                    </p>
                  </div>
                </div>
              </label>

              <label className="payment-radio-card">
                <input
                  type="radio"
                  value="BANK_TRANSFER"
                  {...register("paymentMethod")}
                />
                <div className="payment-card-content">
                  <CreditCard className="payment-icon text-blue" size={24} />
                  <div>
                    <strong>Chuyển khoản</strong>
                    <p className="text-muted text-xs">
                      Mã QR xuất hiện sau khi shop xác nhận đơn.
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Order Summary & Quote Breakdown */}
        <div className="checkout-summary-section card">
          <div className="summary-header">
            <h2 className="section-subtitle">Tóm tắt đơn hàng</h2>
            <button
              type="button"
              onClick={fetchQuote}
              className="btn-text-sm"
              disabled={checkingQuote || isSubmitting}
              title="Làm mới báo giá"
            >
              <RefreshCw size={14} />{" "}
              {checkingQuote ? "Đang kiểm tra…" : "Kiểm tra lại giá"}
            </button>
          </div>

          {quote && !checkingQuote ? (
            <div className="quote-breakdown">
              <div className="quote-badge">
                <Clock size={14} />{" "}
                {quoteExpired
                  ? "Giá đã hết hạn. Nhấn kiểm tra lại giá."
                  : `Giữ giá đến ${new Date(quote.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
              </div>

              <div className="quote-items-list">
                {quote.items.map((item) => (
                  <div
                    key={`${item.kind}-${item.catalogId}`}
                    className="quote-item-row"
                  >
                    <div>
                      <span className="quote-item-name">{item.name}</span>
                      <span className="quote-item-qty"> x{item.quantity}</span>
                      {(!item.isAvailable ||
                        item.availableStock < item.quantity) && (
                        <p className="field-error">
                          {item.availableStock > 0
                            ? `Chỉ còn ${item.availableStock} món. Sửa số lượng trong giỏ.`
                            : "Hết hàng. Xóa món này khỏi giỏ."}
                        </p>
                      )}
                    </div>
                    <span className="quote-item-price">
                      {item.lineTotal.toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                ))}
              </div>

              <div className="quote-total-row">
                <span>Tổng thanh toán:</span>
                <strong className="quote-total-amount">
                  {quote.total.toLocaleString("vi-VN")} đ
                </strong>
              </div>
            </div>
          ) : (
            <div className="text-muted text-center py-4">
              Đang kiểm tra báo giá...
            </div>
          )}

          <div className="checkout-security-notice">
            <ShieldCheck size={16} />
            <span>
              Đơn hàng được lưu giữ hàng trong 24 giờ sau khi gửi thành công.
            </span>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              orderMutation.isPending ||
              !quote ||
              checkingQuote ||
              quoteExpired ||
              unavailableItems ||
              !shop?.acceptingOrders ||
              pickupPoints.length === 0
            }
            className="btn-primary full-width mt-4 btn-lg"
          >
            {isSubmitting || orderMutation.isPending
              ? "Đang tạo đơn hàng..."
              : "Xác nhận đặt hàng"}
          </button>

          <Link to="/cart" className="btn-secondary full-width mt-2">
            Quay lại giỏ hàng
          </Link>
        </div>
      </form>
    </div>
  );
};
