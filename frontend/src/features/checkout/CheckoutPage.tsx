import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ShieldCheck, Clock, CreditCard, Banknote, AlertCircle, RefreshCw } from 'lucide-react';
import { useCart } from '../cart/cart-context';
import { useAuth } from '../auth/auth-context';
import { useShopInfo } from '../catalog/api';
import { useCheckoutQuote, useCreateOrder, createGuestSession } from './api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import type { QuoteResponse, PaymentMethod } from '../../types/api';

const checkoutSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Họ và tên phải có ít nhất 2 ký tự')
    .max(100, 'Họ và tên tối đa 100 ký tự'),
  phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ (cần 10 chữ số hợp lệ tại Việt Nam)'),
  email: z
    .string()
    .trim()
    .email('Địa chỉ email không đúng định dạng')
    .max(254, 'Email tối đa 254 ký tự'),
  className: z.string().max(50, 'Lớp học tối đa 50 ký tự').optional(),
  pickupPointId: z.string().min(1, 'Vui lòng chọn địa điểm nhận hàng tại trường'),
  requestedPickupAt: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER'] as const),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export const CheckoutPage: React.FC = () => {
  const { items, clearCart } = useCart();
  const { isAuthenticated, profile } = useAuth();
  const { data: shop, isLoading: shopLoading } = useShopInfo();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<unknown | null>(null);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  const quoteMutation = useCheckoutQuote();
  const orderMutation = useCreateOrder();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: profile?.fullName || '',
      phone: profile?.phone || '',
      email: profile?.email || '',
      className: '',
      pickupPointId: '',
      paymentMethod: 'CASH',
      note: '',
    },
  });

  // Pre-fill profile info if customer is logged in
  useEffect(() => {
    if (profile) {
      if (profile.fullName) setValue('fullName', profile.fullName);
      if (profile.phone) setValue('phone', profile.phone);
      if (profile.email) setValue('email', profile.email);
    }
  }, [profile, setValue]);

  // Request Quote on Mount or when items change
  const fetchQuote = async () => {
    if (items.length === 0) return;
    setQuoteError(null);
    try {
      // Ensure guest session cookie is issued if guest
      if (!isAuthenticated) {
        await createGuestSession().catch(() => {});
      }

      const res = await quoteMutation.mutateAsync({
        items: items.map((i) => ({
          kind: i.kind,
          catalogId: i.catalogId,
          quantity: i.quantity,
        })),
      });
      setQuote(res);
    } catch (err) {
      setQuoteError(err);
    }
  };

  useEffect(() => {
    if (items.length === 0) {
      navigate('/cart');
      return;
    }
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const onSubmit = async (data: CheckoutFormData) => {
    if (!quote) {
      alert('Vui lòng chờ xác thực báo giá giỏ hàng!');
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
        requestedPickupAt: data.requestedPickupAt ? new Date(data.requestedPickupAt).toISOString() : undefined,
        paymentMethod: data.paymentMethod as PaymentMethod,
        note: data.note || undefined,
      };

      const result = await orderMutation.mutateAsync(orderPayload);
      clearCart();
      navigate('/order-success', {
        state: {
          order: result,
          buyer: orderPayload.buyer,
          pickupPoint: shop?.pickupPoints.find((p) => p.id === data.pickupPointId)?.name,
          paymentMethod: data.paymentMethod,
        },
      });
    } catch (err) {
      setSubmitError(err);
    }
  };

  if (shopLoading || quoteMutation.isPending) {
    return <LoadingSpinner message="Đang kiểm tra tồn kho và lấy báo giá giỏ hàng..." />;
  }

  const pickupPoints = shop?.pickupPoints.filter((p) => p.active) || [];

  return (
    <div className="checkout-page container">
      <h1 className="page-title">Xác nhận thông tin & Đặt hàng</h1>

      {shop && !shop.acceptingOrders && (
        <div className="shop-closed-alert mb-4">
          <AlertCircle size={20} />
          <strong>Shop hiện đang tạm ngưng nhận đơn mới. Quý khách vui lòng thử lại sau!</strong>
        </div>
      )}

      {quoteError != null && (
        <div className="mb-4">
          <ErrorMessage
            error={quoteError}
            onRetry={fetchQuote}
          />
        </div>
      )}

      {submitError != null && (
        <div className="mb-4">
          <ErrorMessage
            error={submitError}
            onRetry={handleSubmit(onSubmit)}
          />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="checkout-layout">
        {/* Buyer Information Form */}
        <div className="checkout-form-section card">
          <h2 className="section-subtitle">Thông tin người mua</h2>
          <p className="text-muted text-xs mb-3">
            Thông tin dùng để người bán liên hệ xác nhận đơn và bàn giao hàng tại trường.
          </p>

          <div className="form-group">
            <label htmlFor="fullName" className="form-label">
              Họ và tên học sinh / người nhận *
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="Ví dụ: Nguyễn Văn A"
              className={`input-field ${errors.fullName ? 'input-error' : ''}`}
              {...register('fullName')}
            />
            {errors.fullName && <span className="field-error">{errors.fullName.message}</span>}
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="phone" className="form-label">
                Số điện thoại liên hệ *
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="Ví dụ: 0912345678"
                className={`input-field ${errors.phone ? 'input-error' : ''}`}
                {...register('phone')}
              />
              {errors.phone && <span className="field-error">{errors.phone.message}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Địa chỉ Email *
              </label>
              <input
                id="email"
                type="email"
                placeholder="Ví dụ: hocsinh@gmail.com"
                className={`input-field ${errors.email ? 'input-error' : ''}`}
                {...register('email')}
              />
              {errors.email && <span className="field-error">{errors.email.message}</span>}
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="className" className="form-label">
                Lớp / Phòng học (tùy chọn)
              </label>
              <input
                id="className"
                type="text"
                placeholder="Ví dụ: 12A1"
                className="input-field"
                {...register('className')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="pickupPointId" className="form-label">
                Điểm nhận hàng trong trường *
              </label>
              <select
                id="pickupPointId"
                className={`select-field ${errors.pickupPointId ? 'input-error' : ''}`}
                {...register('pickupPointId')}
              >
                <option value="">-- Chọn điểm hẹn nhận hàng --</option>
                {pickupPoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.instructions ? `(${p.instructions})` : ''}
                  </option>
                ))}
              </select>
              {errors.pickupPointId && (
                <span className="field-error">{errors.pickupPointId.message}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="requestedPickupAt" className="form-label">
              Thời gian mong muốn nhận (giờ ra chơi, tan học...)
            </label>
            <input
              id="requestedPickupAt"
              type="datetime-local"
              className="input-field"
              {...register('requestedPickupAt')}
            />
          </div>

          <div className="form-group">
            <label htmlFor="note" className="form-label">
              Ghi chú thêm cho người bán
            </label>
            <textarea
              id="note"
              rows={2}
              placeholder="Ví dụ: Em nhận vào giờ ra chơi tiết 2 ạ..."
              className="textarea-field"
              {...register('note')}
            />
          </div>

          {/* Payment Method Selection */}
          <div className="form-group mt-4">
            <label className="form-label font-bold">Phương thức thanh toán:</label>
            <div className="payment-options-grid">
              <label className="payment-radio-card">
                <input
                  type="radio"
                  value="CASH"
                  {...register('paymentMethod')}
                />
                <div className="payment-card-content">
                  <Banknote className="payment-icon text-green" size={24} />
                  <div>
                    <strong>Tiền mặt khi nhận hàng (CASH)</strong>
                    <p className="text-muted text-xs">Trả tiền trực tiếp cho người bán khi nhận hàng.</p>
                  </div>
                </div>
              </label>

              <label className="payment-radio-card">
                <input
                  type="radio"
                  value="BANK_TRANSFER"
                  {...register('paymentMethod')}
                />
                <div className="payment-card-content">
                  <CreditCard className="payment-icon text-blue" size={24} />
                  <div>
                    <strong>Chuyển khoản QR ngân hàng (BANK_TRANSFER)</strong>
                    <p className="text-muted text-xs">
                      Chuyển sau khi người bán chấp nhận đơn; đối soát thủ công bằng mã đơn.
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
              title="Làm mới báo giá"
            >
              <RefreshCw size={14} /> Cập nhật
            </button>
          </div>

          {quote ? (
            <div className="quote-breakdown">
              <div className="quote-badge">
                <Clock size={14} /> Báo giá có hiệu lực trong 5 phút
              </div>

              <div className="quote-items-list">
                {quote.items.map((item) => (
                  <div key={`${item.kind}-${item.catalogId}`} className="quote-item-row">
                    <div>
                      <span className="quote-item-name">{item.name}</span>
                      <span className="quote-item-qty"> x{item.quantity}</span>
                    </div>
                    <span className="quote-item-price">
                      {item.lineTotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                ))}
              </div>

              <div className="quote-total-row">
                <span>Tổng thanh toán:</span>
                <strong className="quote-total-amount">
                  {quote.total.toLocaleString('vi-VN')} đ
                </strong>
              </div>
            </div>
          ) : (
            <div className="text-muted text-center py-4">Đang kiểm tra báo giá...</div>
          )}

          <div className="checkout-security-notice">
            <ShieldCheck size={16} />
            <span>Đơn hàng được lưu giữ hàng trong 24 giờ sau khi gửi thành công.</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || orderMutation.isPending || !quote || (shop && !shop.acceptingOrders)}
            className="btn-primary full-width mt-4 btn-lg"
          >
            {isSubmitting || orderMutation.isPending ? 'Đang tạo đơn hàng...' : 'Xác nhận đặt hàng'}
          </button>

          <Link to="/cart" className="btn-secondary full-width mt-2">
            Quay lại giỏ hàng
          </Link>
        </div>
      </form>
    </div>
  );
};
