import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingBag, ArrowRight, Search } from "lucide-react";
import { useCustomerOrders } from "./api";
import { useAuth } from "../auth/auth-context";
import { GuestOrderLookup } from "./GuestOrderLookupPage";
import "./customer-orders.css";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../../components/StatusBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";
import { OrderCode } from "../../components/OrderCode";

export const CustomerOrdersPage: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const lookup = searchParams.get("view") === "lookup";

  const selectView = (view: "history" | "lookup") => {
    const next = new URLSearchParams(searchParams);
    if (view === "lookup") next.set("view", "lookup");
    else next.delete("view");
    setSearchParams(next);
  };

  return (
    <div className="customer-orders-page container">
      <h1 className="page-title">
        <ShoppingBag size={24} aria-hidden="true" /> Đơn hàng của tôi
      </h1>
      <nav className="customer-order-views" aria-label="Các mục đơn hàng">
        <button type="button" className={lookup ? "btn-secondary" : "btn-primary"}
          aria-pressed={!lookup} onClick={() => selectView("history")}>
          <ShoppingBag size={18} aria-hidden="true" /> Lịch sử đặt hàng
        </button>
        <button type="button" className={lookup ? "btn-primary" : "btn-secondary"}
          aria-pressed={lookup} onClick={() => selectView("lookup")}>
          <Search size={18} aria-hidden="true" /> Tra cứu đơn
        </button>
      </nav>
      {lookup ? <GuestOrderLookup /> : isLoading ? (
        <LoadingSpinner message="Đang tải thông tin tài khoản..." />
      ) : isAuthenticated ? <CustomerOrderHistory key={user?.id} /> : (
        <section className="order-history-signin" aria-labelledby="order-history-signin-title">
          <h2 id="order-history-signin-title">Đăng nhập để xem lịch sử đặt hàng</h2>
          <p>Các đơn hàng bạn đặt khi đã đăng nhập sẽ được lưu tại đây. Nếu đặt hàng không đăng nhập, chọn “Tra cứu đơn” để tìm bằng mã đơn và khóa truy cập.</p>
          <Link to="/login" state={{ from: { pathname: "/account/orders" } }} className="btn-primary">
            Đăng nhập xem lịch sử <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
};

const CustomerOrderHistory: React.FC = () => {
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
    <section aria-label="Lịch sử đặt hàng">
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
                        <OrderCode value={order.orderCode} />
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
    </section>
  );
};
