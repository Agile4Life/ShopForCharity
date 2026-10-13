import { useState } from "react";
import { Link } from "react-router-dom";
import { useSellerConfirmedOrders } from "./api";
import { OrderCode, normalizeOrderCode } from "../../components/OrderCode";
import { DatePicker } from "../../components/DatePicker";
import { OrderStatusBadge, PaymentStatusBadge } from "../../components/StatusBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";
import "./confirmed-order-history.css";

const money = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`;
const vietnamDate = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

export function ConfirmedOrderHistory() {
  const [orderCode, setOrderCode] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useSellerConfirmedOrders({
    orderCode: normalizeOrderCode(orderCode) || undefined, date: date || undefined, page, size: 20,
  });

  return <section className="confirmed-order-history" aria-label="Lịch sử đơn đã xác nhận">
    <h2 className="section-title">Đơn đã xác nhận</h2>
    <p className="text-sm text-muted mb-4">Tổng hợp các đơn đã xác nhận thành công, gồm đơn cũ đang chuẩn bị, sẵn sàng nhận hoặc đã hoàn tất. Thời gian hiển thị theo giờ Việt Nam.</p>
    <div className="card mb-4">
      <div className="filter-grid">
        <label>
          <span className="form-label">Tìm mã đơn đã xác nhận</span>
          <input type="search" className="input-field" placeholder="ORD-..." maxLength={100} value={orderCode}
            onChange={event => { setOrderCode(event.target.value); setPage(0); }} />
        </label>
        <DatePicker label="Ngày xác nhận đơn" placeholder="Tất cả ngày" value={date}
          onChange={value => { setDate(value); setPage(0); }} />
      </div>
      {(orderCode || date) && <button type="button" className="btn-text-sm mt-2"
        onClick={() => { setOrderCode(""); setDate(""); setPage(0); }}>Xóa bộ lọc</button>}
    </div>
    {isLoading ? <LoadingSpinner message="Đang tải lịch sử đơn đã xác nhận..." />
      : error && !data ? <ErrorMessage error={error} onRetry={refetch} />
      : data ? <>
        {error && <ErrorMessage error={error} onRetry={refetch} />}
        <dl className="confirmed-history-summary mb-4" aria-label="Tổng hợp theo bộ lọc">
          <div className="card"><dt>Số đơn đã xác nhận</dt><dd>{data.totalElements.toLocaleString("vi-VN")}</dd></div>
          <div className="card"><dt>Tổng giá trị đơn</dt><dd>{money(data.summary.totalValue)}</dd></div>
          <div className="card"><dt>Giá trị đơn đã thanh toán</dt><dd>{money(data.summary.paidValue)}</dd></div>
        </dl>
        <p className="text-sm text-muted mb-4">Số liệu tính trên tất cả đơn khớp bộ lọc. Tổng giá trị đơn bao gồm cả đơn chưa thanh toán.</p>
        {data.content.length === 0 ? <EmptyState title="Chưa có đơn đã xác nhận"
          description="Không có đơn đã xác nhận thành công khớp bộ lọc hiện tại." />
          : <div className="card">
            <div className="table-responsive">
              <table className="confirmed-history-table">
                <caption className="sr-only">Lịch sử các đơn đã xác nhận thành công</caption>
                <thead><tr><th scope="col">Đơn hàng</th><th scope="col">Khách hàng</th>
                  <th scope="col">Xác nhận</th><th scope="col">Nhận hàng</th><th scope="col">Giá trị / thanh toán</th></tr></thead>
                <tbody>{data.content.map(order => <tr key={order.id}>
                  <td data-label="Đơn hàng"><Link to={`/seller/orders/${order.id}`} aria-label={`Xem đơn ${order.orderCode}`}>
                    <strong><OrderCode value={order.orderCode} /></strong></Link>
                    <span className="block mt-1"><OrderStatusBadge status={order.status} /></span></td>
                  <td data-label="Khách hàng"><strong>{order.buyerName}</strong><span className="block text-sm text-muted">{order.buyerPhone}</span></td>
                  <td data-label="Xác nhận">{order.acceptedAt ? <time dateTime={order.acceptedAt}>{vietnamDate(order.acceptedAt)}</time> : "Chưa có lịch sử xác nhận"}
                    <span className="block text-sm text-muted">{order.acceptedBy || "Người bán"}</span></td>
                  <td data-label="Nhận hàng">{order.pickupPointName}
                    {order.pickupAt && <time className="block text-sm text-muted" dateTime={order.pickupAt}>{vietnamDate(order.pickupAt)}</time>}</td>
                  <td data-label="Giá trị / thanh toán"><strong>{money(order.total)}</strong>
                    <span className="block mt-1"><PaymentStatusBadge status={order.paymentStatus} /></span></td>
                </tr>)}</tbody>
              </table>
            </div>
            {data.totalPages > 1 && <div className="pagination-controls">
              <button type="button" className="btn-secondary-sm" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Trang trước</button>
              <span className="pagination-info">Trang {page + 1} / {data.totalPages}</span>
              <button type="button" className="btn-secondary-sm" disabled={page >= data.totalPages - 1}
                onClick={() => setPage(value => Math.min(data.totalPages - 1, value + 1))}>Trang sau</button>
            </div>}
          </div>}
      </> : null}
  </section>;
}
