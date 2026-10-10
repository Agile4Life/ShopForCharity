import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { WorkshopArt } from "./WorkshopArt";
import { useAuth } from "../features/auth/auth-context";

// Reveal individual surfaces, rather than hiding entire long pages or tables.
const revealSelector = [
  "[data-reveal]", ".section-heading", ".catalog-toolbar", ".shop-status-strip",
  ".product-card", ".combo-card", ".combo-intro", ".combo-coming-soon",
  ".workshop-steps > li", ".detail-media", ".detail-info", ".card",
  ".cart-item-card", ".cart-summary-card",
].join(", ");

export function PageExperience() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const anchorFrame = hash ? requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      ) : null;
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    const main = document.getElementById("main-content");
    if (!main) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (typeof window.IntersectionObserver !== "function") return;
    const pending = new Set<Element>();
    const show = (el: Element) => {
      el.classList.add("is-visible");
      pending.delete(el);
      observer.unobserve(el);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            show(entry.target);
          }
        });
      },
      // A tall card must still appear when only its top enters the viewport.
      { threshold: 0, rootMargin: "0px 0px -24px 0px" },
    );
    const watched = new WeakSet<Element>();
    const scan = () => {
      const surfaces = Array.from(main.querySelectorAll(revealSelector)).filter(el => {
        if (watched.has(el)) return;
        watched.add(el);
        return !el.closest("[role='dialog'], .modal-backdrop") &&
          !el.parentElement?.closest(revealSelector);
      }).map(el => ({ el, top: el.getBoundingClientRect().top }));
      surfaces.forEach(({ el, top }) => {
        // Content already on screen stays readable immediately, including API updates.
        if (motion.matches || top < window.innerHeight - 24 ||
            el.contains(document.activeElement)) {
          show(el);
          return;
        }
        el.classList.add("reveal-ready");
        pending.add(el);
        observer.observe(el);
      });
    };
    scan();
    let scanFrame: number | null = null;
    const mutation = new MutationObserver(() => {
      if (scanFrame !== null) return;
      scanFrame = requestAnimationFrame(() => { scanFrame = null; scan(); });
    });
    mutation.observe(main, { childList: true, subtree: true });
    const revealFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const surface = event.target.closest(".reveal-ready");
      if (surface) show(surface);
    };
    const reduceMotion = () => {
      if (motion.matches) pending.forEach(show);
    };
    main.addEventListener("focusin", revealFocus);
    motion.addEventListener("change", reduceMotion);
    return () => {
      if (anchorFrame !== null) cancelAnimationFrame(anchorFrame);
      if (scanFrame !== null) cancelAnimationFrame(scanFrame);
      observer.disconnect();
      mutation.disconnect();
      main.removeEventListener("focusin", revealFocus);
      motion.removeEventListener("change", reduceMotion);
      pending.forEach(el => el.classList.remove("reveal-ready"));
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
