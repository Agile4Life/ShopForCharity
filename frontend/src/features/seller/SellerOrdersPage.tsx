import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Search, ArrowRight } from "lucide-react";
import { useSellerOrders } from "./api";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";

export const SellerOrdersPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("");
  const [orderCodeSearch, setOrderCodeSearch] = useState<string>("");
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
            <ShoppingBag size={24} /> Đơn hàng
          </h1>
          <p className="text-muted text-sm"></p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="orders-filter-bar card mb-4">
        <div className="filter-grid">
          <div className="search-field-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="search"
              aria-label="Tìm theo mã đơn"
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
            aria-label="Trạng thái đơn"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="select-field"
          >
            <option value="">-- Tất cả trạng thái đơn --</option>
            <option value="PENDING_CONTACT">Chờ liên hệ</option>
            <option value="ACCEPTED">Đã xác nhận</option>
            <option value="PREPARING">Đang chuẩn bị</option>
            <option value="READY">Sẵn sàng nhận</option>
            <option value="COMPLETED">Hoàn tất</option>
            <option value="REJECTED">Từ chối</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="EXPIRED">Hết hạn</option>
          </select>

          <select
            aria-label="Trạng thái thanh toán"
            value={paymentStatusFilter}
            onChange={(e) => {
              setPaymentStatusFilter(e.target.value);
              setPage(0);
            }}
            className="select-field"
          >
            <option value="">-- Tất cả trạng thái thanh toán --</option>
            <option value="UNPAID">Chưa thanh toán</option>
            <option value="REPORTED">Khách báo đã chuyển</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="REFUND_PENDING">Chờ hoàn tiền</option>
            <option value="REFUNDED">Đã hoàn tiền</option>
          </select>
        </div>
      </div>

      {(statusFilter || paymentStatusFilter || orderCodeSearch) && (
        <button
          type="button"
          className="btn-text-sm mb-4"
          onClick={() => {
            setStatusFilter("");
            setPaymentStatusFilter("");
            setOrderCodeSearch("");
            setPage(0);
          }}
        >
          Xóa bộ lọc
        </button>
      )}
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
                    <td data-label="Mã đơn">
                      <strong className="order-code-highlight">
                        {order.orderCode}
                      </strong>
                    </td>
                    <td data-label="Người mua">
                      <div>
                        <strong>{order.buyerName}</strong>
                        <span className="block text-xs text-muted">
                          {order.buyerPhone}{" "}
                          {order.buyerClass ? `(${order.buyerClass})` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="text-sm" data-label="Điểm nhận">
                      {order.pickupPointName}
                    </td>
                    <td className="text-xs text-muted" data-label="Ngày đặt">
                      {new Date(order.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td data-label="Tổng tiền">
                      <strong>{order.total.toLocaleString("vi-VN")} đ</strong>
                    </td>
                    <td data-label="Trạng thái">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td data-label="Thanh toán">
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/seller/orders/${order.id}`}
                        className="btn-primary-sm"
                      >
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
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages - 1, p + 1))
                }
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
