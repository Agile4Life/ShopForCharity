import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, ShoppingCart, User, LogOut, ShieldCheck, Menu, X, Search } from 'lucide-react';
import { useCart } from '../features/cart/cart-context';
import { useAuth } from '../features/auth/auth-context';

export const Navbar: React.FC = () => {
  const { totalQuantity } = useCart();
  const { isAuthenticated, isSeller, profile, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="navbar-wrapper">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <ShoppingBag className="brand-icon" size={24} />
          <span className="brand-text">School Shop</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="desktop-nav">
          <Link to="/" className="nav-link">
            Trang chủ
          </Link>
          <Link to="/guest-order" className="nav-link">
            <Search size={16} /> Tra cứu đơn
          </Link>

          {isSeller && (
            <div className="seller-nav-group">
              <Link to="/seller" className="nav-link seller-badge-link">
                <ShieldCheck size={16} /> Dashboard Seller
              </Link>
              <Link to="/seller/orders" className="nav-link">
                Đơn hàng
              </Link>
              <Link to="/seller/products" className="nav-link">
                Sản phẩm
              </Link>
              <Link to="/seller/combos" className="nav-link">
                Combo
              </Link>
              <Link to="/seller/settings" className="nav-link">
                Cài đặt
              </Link>
              <Link to="/seller/logs" className="nav-link">
                Audit Log
              </Link>
            </div>
          )}
        </nav>

        {/* Action icons: Cart & Auth */}
        <div className="navbar-actions">
          <Link to="/cart" className="cart-btn" aria-label="Giỏ hàng">
            <ShoppingCart size={20} />
            {totalQuantity > 0 && <span className="cart-badge">{totalQuantity}</span>}
          </Link>

          {isAuthenticated ? (
            <div className="user-menu">
              <Link to={isSeller ? '/seller' : '/account/orders'} className="user-btn">
                <User size={18} />
                <span className="user-name">
                  {profile?.fullName || (isSeller ? 'Người bán' : 'Khách hàng')}
                </span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="logout-btn"
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="guest-auth-buttons">
              <Link to="/login" className="btn-secondary-sm">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn-primary-sm">
                Đăng ký
              </Link>
            </div>
          )}

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            className="mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
            Trang chủ
          </Link>
          <Link to="/guest-order" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
            Tra cứu đơn hàng guest
          </Link>
          <Link to="/cart" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
            Giỏ hàng ({totalQuantity})
          </Link>

          {isAuthenticated && (
            <>
              <div className="mobile-divider" />
              {!isSeller && (
                <>
                  <Link
                    to="/account/orders"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mobile-nav-link"
                  >
                    Lịch sử đơn hàng
                  </Link>
                  <Link
                    to="/account/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mobile-nav-link"
                  >
                    Thông tin tài khoản
                  </Link>
                </>
              )}
              {isSeller && (
                <>
                  <div className="mobile-section-header">Quản trị người bán:</div>
                  <Link to="/seller" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Tổng quan Dashboard
                  </Link>
                  <Link to="/seller/orders" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Quản lý đơn hàng
                  </Link>
                  <Link to="/seller/products" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Quản lý sản phẩm
                  </Link>
                  <Link to="/seller/combos" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Quản lý combo
                  </Link>
                  <Link to="/seller/settings" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Cấu hình shop & QR
                  </Link>
                  <Link to="/seller/logs" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Nhật ký Audit Log
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="mobile-nav-link logout-link"
              >
                Đăng xuất
              </button>
            </>
          )}

          {!isAuthenticated && (
            <>
              <div className="mobile-divider" />
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                Đăng nhập
              </Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                Đăng ký tài khoản
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
};
