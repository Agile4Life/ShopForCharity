import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, ShoppingBag, User, LogOut, Menu, X } from "lucide-react";
import { useCart } from "../features/cart/cart-context";
import { useAuth } from "../features/auth/auth-context";
import { BrandMark } from "./BrandMark";

export function Navbar() {
  const { totalQuantity } = useCart();
  const { isAuthenticated, isSeller, profile, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const setOpen = (value: boolean) => setMenuPath(value ? pathname : null);
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate("/");
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
              <div className="user-menu">
                <Link
                  to="/account/profile"
                  className="user-btn"
                  aria-label="Thông tin tài khoản"
                >
                  <User size={18} aria-hidden="true" />
                  <span className="user-name">
                    {profile?.fullName || "Tài khoản"}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="logout-btn"
                  aria-label="Đăng xuất"
                >
                  <LogOut size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Link to="/login" className="nav-login">
                Đăng nhập <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            )}
            <button
              type="button"
              className="mobile-toggle"
              onClick={() => setOpen(!open)}
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
                <button onClick={handleLogout} className="logout-link">
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
