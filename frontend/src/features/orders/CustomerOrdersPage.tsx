import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { useCustomerOrders } from "./api";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";

export const CustomerOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useCustomerOrders(page, 20);

  if (isLoading) {
    return <LoadingSpinner message="Đang tải lịch sử đơn hàng của bạn..." />;
  }

  if (error && !data) {
    return (
      <div className="container mt-4">
        <ErrorMessage error={error} onRetry={refetch} />
      </div>
    );
  }

  const orders = data?.content || [];

  return (
    <div className="customer-orders-page container">
      <h1 className="page-title">
        <ShoppingBag size={24} /> Đơn hàng của tôi
      </h1>

      {orders.length === 0 ? (
        <EmptyState
          title="Bạn chưa có đơn hàng nào"
          description="Các đơn hàng bạn đặt khi đã đăng nhập tài khoản sẽ xuất hiện ở đây."
          actionText="Chọn sản phẩm"
          onAction={() => navigate("/#catalog")}
        />
      ) : (
        <div className="orders-table-card card">
          <div className="table-responsive">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ngày đặt</th>
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
                    <td data-label="Ngày đặt">
                      {new Date(order.createdAt).toLocaleDateString("vi-VN")}
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
                        to={`/account/orders/${order.id}`}
                        className="btn-secondary-sm"
                      >
                        Xem chi tiết <ArrowRight size={14} />
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
