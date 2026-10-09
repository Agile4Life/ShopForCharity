import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { WorkshopArt } from "./WorkshopArt";
import { useAuth } from "../features/auth/auth-context";

export function PageExperience() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    const main = document.getElementById("main-content");
    if (!main || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    const watched = new WeakSet<Element>();
    const scan = () =>
      main.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        el.classList.add("reveal-ready");
        observer.observe(el);
      });
    scan();
    const mutation = new MutationObserver(scan);
    mutation.observe(main, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, [pathname, hash]);
  return null;
}

const sellerLinks = [
  ["/seller", "Tổng quan"],
  ["/seller/orders", "Đơn hàng"],
  ["/seller/products", "Sản phẩm"],
  ["/seller/combos", "Combo"],
  ["/seller/settings", "Cài đặt"],
  ["/seller/logs", "Nhật ký"],
] as const;

export function RouteCompanion() {
  const { pathname } = useLocation();
  const { isSeller } = useAuth();
  if (pathname.startsWith("/seller") && isSeller)
    return (
      <div className="seller-workspace-bar">
        <div className="container">
          <span className="workspace-label">Bàn làm việc của tiệm</span>
          <nav aria-label="Quản lý gian hàng">
            {sellerLinks.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/seller"}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    );
  return null;
}

export function AuthCompanion() {
  return (
    <aside className="auth-companion" aria-label="Gói Ấm Cho Em">
      <h2>
        Gói Ấm
        <br />
        Cho Em
      </h2>
      <WorkshopArt variant="bundle" />
      <Link to="/#catalog" className="text-link">
        Gian hàng <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </aside>
  );
}

export function NotFoundPage() {
  return (
    <div className="container not-found-page">
      <span className="eyebrow">404</span>
      <h1>Không tìm thấy trang</h1>
      <Link to="/" className="btn-primary">
        <ArrowLeft size={18} aria-hidden="true" /> Về gian hàng
      </Link>
      <WorkshopArt />
    </div>
  );
}
