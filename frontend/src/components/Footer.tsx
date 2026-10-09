import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./BrandMark";
const currentYear = new Date().getFullYear();
export function Footer() {
  return (
    <footer className="footer-wrapper">
      <div className="footer-container">
        <div className="footer-brand">
          <Link to="/" className="navbar-brand">
            <BrandMark className="brand-icon" />
            <span className="brand-text brand-name">Gói Ấm Cho Em</span>
          </Link>
        </div>
        <div className="footer-links">
          <Link to="/#catalog">
            Gian hàng <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/guest-order">
            Tra cứu đơn hàng <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/account/orders">
            Đơn hàng của tôi <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {currentYear} Gói Ấm Cho Em</span>
      </div>
    </footer>
  );
}
