import { Component, forwardRef, useEffect, useState, useSyncExternalStore } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Check,
  Eye,
  EyeOff,
  Home,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { useCart } from "../features/cart/cart-context";
import { useAuth } from "../features/auth/auth-context";
import type { OrderStatus } from "../types/api";
import { dismissFeedback, getFeedbackQueue, subscribeFeedback } from "../lib/feedback";
export { notify, notifyError } from "../lib/feedback";

class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="container route-error" role="alert">
          <h1 className="page-title">Chưa mở được trang</h1>
          <p>Thử tải lại trang để tiếp tục.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
          <Link to="/" className="text-link">
            Về gian hàng
          </Link>
        </div>
      );
    return this.props.children;
  }
}
export function RouteContentBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageBoundary key={pathname}>{children}</PageBoundary>;
}

export function OrderProgress({ status }: { status: OrderStatus }) {
  const current = {
    PENDING_CONTACT: 0,
    ACCEPTED: 1,
    PREPARING: 1,
    READY: 2,
    COMPLETED: 3,
  }[
    status as
      "PENDING_CONTACT" | "ACCEPTED" | "PREPARING" | "READY" | "COMPLETED"
  ];
  if (current === undefined) return null;
  return (
    <ol className="order-progress" aria-label="Tiến trình đơn hàng">
      {["Chờ xác nhận", "Chuẩn bị", "Có thể nhận", "Hoàn tất"].map(
        (label, index) => (
          <li
            key={label}
            className={index <= current ? "is-reached" : ""}
            aria-current={index === current ? "step" : undefined}
          >
            <span aria-hidden="true">
              {index < current ? <Check size={14} /> : index + 1}
            </span>
            {label}
          </li>
        ),
      )}
    </ol>
  );
}

export function FeedbackNotice() {
  const feedback = useSyncExternalStore(subscribeFeedback, getFeedbackQueue)[0];
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(
      dismissFeedback,
      feedback.action || feedback.tone === "error" ? 15000 : 8000,
    );
    return () => clearTimeout(timer);
  }, [feedback]);
  if (!feedback) return null;
  return (
    <div
      className={`feedback-notice ${feedback.tone === "error" ? "feedback-error" : ""}`}
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      {feedback.tone === "success" && <Check size={20} className="feedback-icon" aria-hidden="true" />}
      <span>{feedback.message}</span>
      {feedback.to && (
        <Link to={feedback.to} onClick={dismissFeedback}>
          Xem giỏ
        </Link>
      )}
      {feedback.action && (
        <button
          type="button"
          onClick={() => {
            feedback.action?.onClick();
            dismissFeedback();
          }}
        >
          {feedback.action.label}
        </button>
      )}
      <button
        type="button"
        className="feedback-close"
        aria-label="Đóng thông báo"
        onClick={dismissFeedback}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export const PasswordField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input {...props} ref={ref} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff size={20} aria-hidden="true" />
        ) : (
          <Eye size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
});

export function QuantityControl({
  value,
  max = 20,
  label = "Số lượng",
  onChange,
}: {
  value: number;
  max?: number;
  label?: string;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="quantity-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="step-btn"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label={`Giảm ${label.toLowerCase()}`}
      >
        <Minus size={17} aria-hidden="true" />
      </button>
      <output className="quantity-val" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="step-btn"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`Tăng ${label.toLowerCase()}`}
      >
        <Plus size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PurchaseSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <nav className="purchase-steps" aria-label="Tiến trình đặt hàng">
      <ol>
        {[
          ["Giỏ hàng", "/cart"],
          ["Đặt hàng", "/checkout"],
          ["Hoàn tất", "/order-success"],
        ].map(([label, to], i) => (
          <li
            key={to}
            className={
              i + 1 === step ? "is-current" : i + 1 < step ? "is-done" : ""
            }
            aria-current={i + 1 === step ? "step" : undefined}
          >
            <span className="purchase-step-number">
              {i + 1 < step ? <Check size={14} aria-hidden="true" /> : i + 1}
            </span>
            {i + 1 < step && step < 3 ? (
              <Link to={to}>{label}</Link>
            ) : (
              <span>{label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function MobileNavigation() {
  const { pathname } = useLocation();
  const { totalQuantity } = useCart();
  const { isAuthenticated } = useAuth();
  if (pathname.startsWith("/seller") || pathname.startsWith("/auth/"))
    return null;
  return (
    <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh">
      <NavLink to="/" end>
        <Home size={21} aria-hidden="true" />
        <span>Gian hàng</span>
      </NavLink>
      <NavLink
        to="/cart"
        className={pathname === "/checkout" ? "active" : undefined}
      >
        <span className="mobile-cart-icon">
          <ShoppingBag size={21} aria-hidden="true" />
          {totalQuantity > 0 && (
            <span className="mobile-cart-count">{totalQuantity}</span>
          )}
        </span>
        <span>Giỏ hàng</span>
      </NavLink>
      <NavLink to={isAuthenticated ? "/account/orders" : "/guest-order"}>
        <Search size={21} aria-hidden="true" />
        <span>Đơn hàng</span>
      </NavLink>
      <NavLink to={isAuthenticated ? "/account/profile" : "/login"}>
        <User size={21} aria-hidden="true" />
        <span>{isAuthenticated ? "Tài khoản" : "Đăng nhập"}</span>
      </NavLink>
    </nav>
  );
}

export function AccountNavigation() {
  const { pathname } = useLocation();
  if (!pathname.startsWith("/account")) return null;
  return (
    <nav className="account-navigation container" aria-label="Tài khoản">
      <NavLink to="/account/orders">Đơn hàng</NavLink>
      <NavLink to="/account/profile">Thông tin cá nhân</NavLink>
    </nav>
  );
}
