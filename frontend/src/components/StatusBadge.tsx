import React from 'react';
import type { OrderStatus, PaymentStatus, ProductStatus } from '../types/api';

export const ORDER_STATUS_MAP: Record<OrderStatus, { label: string; colorClass: string }> = {
  PENDING_CONTACT: { label: 'Chờ liên hệ', colorClass: 'badge-yellow' },
  ACCEPTED: { label: 'Đã xác nhận', colorClass: 'badge-blue' },
  PREPARING: { label: 'Đang chuẩn bị', colorClass: 'badge-purple' },
  READY: { label: 'Sẵn sàng nhận', colorClass: 'badge-teal' },
  COMPLETED: { label: 'Hoàn tất', colorClass: 'badge-green' },
  REJECTED: { label: 'Từ chối', colorClass: 'badge-red' },
  CANCELLED: { label: 'Đã hủy', colorClass: 'badge-gray' },
  EXPIRED: { label: 'Hết hạn', colorClass: 'badge-gray' },
};

export const PAYMENT_STATUS_MAP: Record<PaymentStatus, { label: string; colorClass: string }> = {
  UNPAID: { label: 'Chưa thanh toán', colorClass: 'badge-gray' },
  REPORTED: { label: 'Đã báo chuyển khoản', colorClass: 'badge-yellow' },
  PAID: { label: 'Đã thanh toán', colorClass: 'badge-green' },
  REFUND_PENDING: { label: 'Chờ hoàn tiền', colorClass: 'badge-orange' },
  REFUNDED: { label: 'Đã hoàn tiền', colorClass: 'badge-blue' },
};

export const PRODUCT_STATUS_MAP: Record<ProductStatus, { label: string; colorClass: string }> = {
  ACTIVE: { label: 'Đang mở bán', colorClass: 'badge-green' },
  DRAFT: { label: 'Bản nháp', colorClass: 'badge-yellow' },
  ARCHIVED: { label: 'Đã ẩn', colorClass: 'badge-gray' },
};

export const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const info = ORDER_STATUS_MAP[status] || { label: status, colorClass: 'badge-gray' };
  return <span className={`badge ${info.colorClass}`}>{info.label}</span>;
};

export const PaymentStatusBadge: React.FC<{ status: PaymentStatus }> = ({ status }) => {
  const info = PAYMENT_STATUS_MAP[status] || { label: status, colorClass: 'badge-gray' };
  return <span className={`badge ${info.colorClass}`}>{info.label}</span>;
};

export const ProductStatusBadge: React.FC<{ status: ProductStatus }> = ({ status }) => {
  const info = PRODUCT_STATUS_MAP[status] || { label: status, colorClass: 'badge-gray' };
  return <span className={`badge ${info.colorClass}`}>{info.label}</span>;
};
