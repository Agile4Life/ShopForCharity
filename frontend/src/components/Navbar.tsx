import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useRef } from "react";
import { ArrowUpRight, ChevronDown, ShoppingBag, User, LogOut, Menu, X } from "lucide-react";
import { useCart } from "../features/cart/cart-context";
import { useAuth } from "../features/auth/auth-context";
import { BrandMark } from "./BrandMark";
import { notifyError } from "../lib/feedback";

export function Navbar() {
  const { totalQuantity } = useCart();
  const { isAuthenticated, isSeller, profile, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const setOpen = (value: boolean) => setMenuPath(value ? pathname : null);
  const navigate = useNavigate();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const logoutBusy = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    if (accountMenu.current) accountMenu.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPath(null);
        if (accountMenu.current?.open) {
          accountMenu.current.open = false;
          accountMenu.current.querySelector("summary")?.focus();
        }
      }
    };
    const onOutside = (event: Event) => {
      if (event.target instanceof Node && !accountMenu.current?.contains(event.target)) {
        if (accountMenu.current) accountMenu.current.open = false;
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, []);
  const handleLogout = async () => {
    if (logoutBusy.current) return;
    logoutBusy.current = true;
    setLoggingOut(true);
    setOpen(false);
    if (accountMenu.current) accountMenu.current.open = false;
    // Leave a protected page before SIGNED_OUT triggers its login redirect.
    navigate("/", { replace: true });
    try { await logout(); }
    catch (error) { notifyError(error, "Chưa đăng xuất được. Vui lòng thử lại."); }
    finally { logoutBusy.current = false; setLoggingOut(false); }
  };
  return (
    <>
      <a className="skip-link" href="#main-content">
        Đi đến nội dung chính
      </a>
      <header className="navbar-wrapper">
        <div className="navbar-container">
          <Link
            to="/"
            className="navbar-brand"
            aria-label="Gói Ấm Cho Em — về trang chủ"
          >
            <BrandMark className="brand-icon" />
            <span className="brand-text brand-name">Gói Ấm Cho Em</span>
          </Link>
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <NavLink to="/" end className="nav-link">
              Gian hàng
            </NavLink>
            <Link to="/#combos" className="nav-link">
              Combo
            </Link>
            <NavLink to="/guest-order" className="nav-link">
              Tra cứu đơn
            </NavLink>
            {isSeller && (
              <NavLink to="/seller" className="nav-link seller-badge-link">
                Bàn làm việc <ArrowUpRight size={15} aria-hidden="true" />
              </NavLink>
            )}
          </nav>
          <div className="navbar-actions">
            <Link
              to="/cart"
              className="cart-btn"
              aria-label={`Giỏ hàng, ${totalQuantity} món`}
            >
              <ShoppingBag size={21} aria-hidden="true" />
              <span className="cart-label">Giỏ đồ</span>
              <span key={totalQuantity} className="cart-badge">
                {totalQuantity}
              </span>
            </Link>
            {isAuthenticated ? (
              <details className="user-menu account-dropdown" ref={accountMenu}
                onToggle={() => {
                  if (accountMenu.current?.open) setMenuPath(null);
                }}
              >
                <summary className="user-btn" role="button" aria-label="Menu tài khoản">
                  <User size={18} aria-hidden="true" />
                  <span className="user-name">
                    {profile?.fullName || "Tài khoản"}
                  </span>
                  <ChevronDown className="account-chevron" size={15} aria-hidden="true" />
                </summary>
                <nav className="account-dropdown-panel" aria-label="Điều hướng tài khoản"
                  onClick={(event) => {
                    if ((event.target as Element).closest("a") && accountMenu.current) {
                      accountMenu.current.open = false;
                    }
                  }}
                >
                  <div className="account-dropdown-heading">
                    <strong>{profile?.fullName || "Tài khoản"}</strong>
                    <span>{isSeller ? "Người bán" : "Khách hàng"}</span>
                  </div>
                  <NavLink to="/account/profile"><User size={17} aria-hidden="true" />Thông tin tài khoản</NavLink>
                  <NavLink to="/account/orders"><ShoppingBag size={17} aria-hidden="true" />Đơn hàng của tôi</NavLink>
                  {isSeller && <NavLink to="/seller"><ArrowUpRight size={17} aria-hidden="true" />Bàn làm việc</NavLink>}
                  <button type="button" onClick={handleLogout} disabled={loggingOut} aria-busy={loggingOut} className="account-dropdown-logout">
                    <LogOut size={17} aria-hidden="true" />Đăng xuất
                  </button>
                </nav>
              </details>
            ) : (
              <Link to="/login" className="nav-login">
                Đăng nhập <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            )}
            <button
              type="button"
              className="mobile-toggle"
              onClick={() => {
                if (accountMenu.current) accountMenu.current.open = false;
                setOpen(!open);
              }}
              aria-label={open ? "Đóng menu" : "Mở menu"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
            >
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            className="mobile-menu-drawer"
            id="mobile-navigation"
            aria-label="Điều hướng trên điện thoại"
          >
            <NavLink to="/" end onClick={() => setOpen(false)}>
              Gian hàng
            </NavLink>
            <Link to="/#combos" onClick={() => setOpen(false)}>
              Combo
            </Link>
            <NavLink to="/guest-order">Tra cứu đơn</NavLink>
            <NavLink to="/cart">Giỏ đồ ({totalQuantity})</NavLink>
            {isAuthenticated ? (
              <>
                <NavLink to="/account/orders">Đơn hàng của tôi</NavLink>
                <NavLink to="/account/profile">Thông tin tài khoản</NavLink>
                {isSeller && <NavLink to="/seller">Bàn làm việc</NavLink>}
                <button onClick={handleLogout} disabled={loggingOut} aria-busy={loggingOut} className="logout-link">
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login">Đăng nhập</NavLink>
                <NavLink to="/register">Tạo tài khoản</NavLink>
              </>
            )}
          </nav>
        )}
      </header>
    </>
  );
}
