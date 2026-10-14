import { Link } from "react-router-dom";
import { ArrowUpRight, Mail } from "lucide-react";
import { BrandMark } from "./BrandMark";
import thanhDieuAvatar from "../assets/thanh-dieu-avatar-transparent.png";
const currentYear = new Date().getFullYear();
export function Footer() {
  return (
    <footer className="footer-wrapper">
      <div className="footer-container">
        <div className="footer-brand">
          <Link to="/" className="navbar-brand">
            <BrandMark className="brand-icon" />
            <span className="brand-text brand-name">Gói Ấm Trao Em</span>
          </Link>
          <div className="footer-contact">
            <div className="footer-contact-heading">
              <img
                className="footer-contact-avatar"
                src={thanhDieuAvatar}
                alt="Ảnh đại diện Thanh Diệu"
                width={104}
                height={104}
                loading="lazy"
                decoding="async"
              />
              <span className="footer-contact-name">Thanh Diệu</span>
            </div>
            <div className="footer-contact-details">
              <a href="mailto:dieuntt1402@gmail.com" aria-label="Gửi email cho Thanh Diệu: dieuntt1402@gmail.com">
                <Mail size={16} aria-hidden="true" />
                <span>dieuntt1402@gmail.com</span>
              </a>
            </div>
          </div>
        </div>
        <div className="footer-links">
          <Link to="/#catalog">
            Gian hàng <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/account/orders">
            Đơn hàng của tôi <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {currentYear} Gói Ấm Trao Em</span>
      </div>
    </footer>
  );
}
