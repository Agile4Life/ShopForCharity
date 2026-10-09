import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Search, ArrowRight } from 'lucide-react';
import { useSellerOrders } from './api';
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/StatusBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { EmptyState } from '../../components/EmptyState';

export const SellerOrdersPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('');
  const [orderCodeSearch, setOrderCodeSearch] = useState<string>('');
  const [page, setPage] = useState<number>(0);

  const { data, isLoading, error, refetch } = useSellerOrders({
    status: statusFilter || undefined,
    paymentStatus: paymentStatusFilter || undefined,
    orderCode: orderCodeSearch.trim() || undefined,
    page,
    size: 20,
  });

  const orders = data?.content || [];

  return (
    <div className="seller-orders-page container">
      <div className="flex-between mb-4">
        <div>
          <h1 className="page-title">
            <ShoppingBag size={24} /> Quản lý Đơn hàng
          </h1>
          <p className="text-muted text-sm">
            Danh sách tất cả đơn hàng phát sinh trong trường (tự động cập nhật mỗi 10 giây)
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="orders-filter-bar card mb-4">
        <div className="filter-grid">
          <div className="search-field-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo mã đơn (ORD-...)"
              value={orderCodeSearch}
              onChange={(e) => {
                setOrderCodeSearch(e.target.value);
                setPage(0);
              }}
              className="input-field pl-8"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="select-field"
          >
            <option value="">-- Tất cả trạng thái đơn --</option>
            <option value="PENDING_CONTACT">Chờ liên hệ (PENDING_CONTACT)</option>
            <option value="ACCEPTED">Đã xác nhận (ACCEPTED)</option>
            <option value="PREPARING">Đang chuẩn bị (PREPARING)</option>
            <option value="READY">Sẵn sàng nhận (READY)</option>
            <option value="COMPLETED">Hoàn tất (COMPLETED)</option>
            <option value="REJECTED">Từ chối (REJECTED)</option>
            <option value="CANCELLED">Đã hủy (CANCELLED)</option>
            <option value="EXPIRED">Hết hạn (EXPIRED)</option>
          </select>

          <select
            value={paymentStatusFilter}
            onChange={(e) => {
              setPaymentStatusFilter(e.target.value);
              setPage(0);
            }}
            className="select-field"
          >
            <option value="">-- Tất cả trạng thái thanh toán --</option>
            <option value="UNPAID">Chưa thanh toán (UNPAID)</option>
            <option value="REPORTED">Khách báo đã chuyển (REPORTED)</option>
            <option value="PAID">Đã thanh toán (PAID)</option>
            <option value="REFUND_PENDING">Chờ hoàn tiền (REFUND_PENDING)</option>
            <option value="REFUNDED">Đã hoàn tiền (REFUNDED)</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <LoadingSpinner message="Đang tải danh sách đơn hàng..." />
      ) : error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Không tìm thấy đơn hàng nào"
          description="Chưa có đơn hàng nào khớp với điều kiện lọc hiện tại."
        />
      ) : (
        <div className="orders-table-card card">
          <div className="table-responsive">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Người mua</th>
                  <th>Điểm nhận</th>
                  <th>Thời gian đặt</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái đơn</th>
                  <th>Thanh toán</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong className="order-code-highlight">{order.orderCode}</strong>
                    </td>
                    <td>
                      <div>
                        <strong>{order.buyerName}</strong>
                        <span className="block text-xs text-muted">
                          {order.buyerPhone} {order.buyerClass ? `(${order.buyerClass})` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="text-sm">{order.pickupPointName}</td>
                    <td className="text-xs text-muted">
                      {new Date(order.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td>
                      <strong>{order.total.toLocaleString('vi-VN')} đ</strong>
                    </td>
                    <td>
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td>
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </td>
                    <td className="text-right">
                      <Link to={`/seller/orders/${order.id}`} className="btn-primary-sm">
                        Xử lý đơn <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="pagination-controls">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary-sm"
              >
                Trang trước
              </button>
              <span className="pagination-info">
                Trang {page + 1} / {data.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages - 1, p + 1))}
                disabled={page >= data.totalPages - 1}
                className="btn-secondary-sm"
              >
                Trang sau
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
