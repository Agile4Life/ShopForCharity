import React from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  DollarSign,
  Package,
  Layers,
  Settings,
  FileText,
  Bell,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import {
  useSellerDashboard,
  useSellerNotifications,
  useMarkNotificationRead,
} from "./api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { AUDIT_ACTION_LABELS } from "./audit-display";

export const SellerDashboardPage: React.FC = () => {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch,
  } = useSellerDashboard();
  const { data: notifications = [], isLoading: notificationsLoading, error: notificationsError, refetch: refetchNotifications } = useSellerNotifications();
  const markReadMutation = useMarkNotificationRead();

  if (statsLoading) {
    return <LoadingSpinner message="Đang tải dữ liệu bảng điều khiển..." />;
  }

  if (statsError && !stats) {
    return (
      <div className="container mt-4">
        <ErrorMessage error={statsError} onRetry={refetch} />
      </div>
    );
  }

  const unreadNotifications = notifications.filter((n) => !n.isRead);

  return (
    <div className="seller-dashboard-page container">
      <div className="dashboard-header flex-between mb-4">
        <div>
          <h1 className="page-title">Tổng quan</h1>
          <p className="text-muted text-sm">
            Theo dõi tổng quan đơn hàng, doanh thu và thông báo mới nhất của
            Shop
          </p>
        </div>
        <div className="quick-links flex gap-2">
          <Link to="/seller/orders" className="btn-primary-sm">
            <ShoppingBag size={16} /> Quản lý đơn hàng
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card card">
          <div className="metric-icon-wrap bg-amber">
            <Clock size={24} className="text-amber" />
          </div>
          <div className="metric-data">
            <span className="metric-label">Đơn chờ xác nhận</span>
            <strong className="metric-val">{stats?.pendingCount ?? 0}</strong>
          </div>
        </div>

        <div className="metric-card card">
          <div className="metric-icon-wrap bg-teal">
            <Package size={24} className="text-teal" />
          </div>
          <div className="metric-data">
            <span className="metric-label">Đơn đã xử lý</span>
            <strong className="metric-val">{stats?.resolvedCount ?? 0}</strong>
          </div>
        </div>

        <div className="metric-card card">
          <div className="metric-icon-wrap bg-green">
            <CheckCircle2 size={24} className="text-green" />
          </div>
          <div className="metric-data">
            <span className="metric-label">Đã thu từ đơn xác nhận</span>
            <strong className="metric-val">
              {(stats?.completedRevenue ?? 0).toLocaleString("vi-VN")} đ
            </strong>
          </div>
        </div>

        <div className="metric-card card">
          <div className="metric-icon-wrap bg-blue">
            <DollarSign size={24} className="text-blue" />
          </div>
          <div className="metric-data">
            <span className="metric-label">Đã thu từ đơn chờ xác nhận</span>
            <strong className="metric-val">
              {(stats?.pendingRevenue ?? 0).toLocaleString("vi-VN")} đ
            </strong>
          </div>
        </div>
      </div>

      <div className="dashboard-sections-grid mt-4">
        {/* Quick Management Shortcuts */}
        <div className="card">
          <h2 className="section-subtitle">Sắp xếp gian hàng</h2>
          <div className="shortcuts-grid mt-3">
            <Link to="/seller/chat" className="shortcut-card"><MessageCircle size={24} className="text-primary" /><div><strong>Hộp thư khách hàng</strong><p className="text-xs text-muted">Cùng trả lời tin nhắn và câu hỏi về sản phẩm</p></div></Link>
            <Link to="/seller/orders" className="shortcut-card">
              <ShoppingBag size={24} className="text-primary" />
              <div>
                <strong>Đơn hàng</strong>
                <p className="text-xs text-muted">
                  Xử lý liên hệ, duyệt đơn, thanh toán
                </p>
              </div>
            </Link>

            <Link to="/seller/products" className="shortcut-card">
              <Package size={24} className="text-primary" />
              <div>
                <strong>Sản phẩm</strong>
                <p className="text-xs text-muted">
                  Thêm món, sửa giá, điều chỉnh tồn kho
                </p>
              </div>
            </Link>

            <Link to="/seller/combos" className="shortcut-card">
              <Layers size={24} className="text-primary" />
              <div>
                <strong>Combo món</strong>
                <p className="text-xs text-muted">
                  Thiết lập combo tiết kiệm cho học sinh
                </p>
              </div>
            </Link>

            <Link to="/seller/settings" className="shortcut-card">
              <Settings size={24} className="text-primary" />
              <div>
                <strong>Cấu hình shop</strong>
                <p className="text-xs text-muted">
                  Bật/tắt nhận đơn, tài khoản ngân hàng & QR
                </p>
              </div>
            </Link>

            <Link to="/seller/logs" className="shortcut-card">
              <FileText size={24} className="text-primary" />
              <div>
                <strong>Audit Log</strong>
                <p className="text-xs text-muted">
                  Xem nhật ký thay đổi và kiểm toán
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Notifications Card */}
        <div className="card">
          <div className="flex-between mb-3">
            <h2 className="section-subtitle flex items-center gap-2">
              <Bell size={18} /> Thông báo mới ({unreadNotifications.length})
            </h2>
          </div>

          {notificationsLoading ? <LoadingSpinner message="Đang tải thông báo…" /> : notificationsError && notifications.length === 0 ? <ErrorMessage error={notificationsError} onRetry={refetchNotifications} /> : notifications.length === 0 ? (
            <p className="text-muted text-sm py-4 text-center">
              Chưa có thông báo nào.
            </p>
          ) : (
            <div className="notifications-list">
              {notifications.slice(0, 8).map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-item ${!notif.isRead ? "unread" : ""}`}
                >
                  <div className="notif-content">
                    <strong className="notif-type text-sm">
                      {AUDIT_ACTION_LABELS[notif.type] ?? "Cập nhật đơn hàng"}
                    </strong>
                    <span className="notif-time text-xs text-muted ml-2">
                      {new Date(notif.createdAt).toLocaleTimeString("vi-VN")}
                    </span>
                    <div className="notification-actions">
                    {notif.orderId && (
                      <Link
                        to={`/seller/orders/${notif.orderId}`}
                        className="notif-link btn-primary-sm"
                      >
                        Xem đơn hàng <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    )}
                  {!notif.isRead && (
                    <button
                      type="button"
                      onClick={() => markReadMutation.mutate(notif.id)}
                      disabled={markReadMutation.isPending}
                      aria-busy={markReadMutation.isPending && markReadMutation.variables === notif.id}
                      className="btn-secondary-sm notification-mark-read"
                    >
                      <CheckCircle2 size={16} aria-hidden="true" />
                      {markReadMutation.isPending && markReadMutation.variables === notif.id ? "Đang lưu…" : "Đánh dấu đã đọc"}
                    </button>
                  )}
                  {notif.isRead && <span className="notification-read-status"><CheckCircle2 size={15} aria-hidden="true" /> Đã đọc</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
