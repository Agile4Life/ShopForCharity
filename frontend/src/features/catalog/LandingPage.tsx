import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Clock3,
  Cookie,
  Gift,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import { useProducts } from "./api";
import { AddToCartButton } from "../cart/AddToCartButton";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { AssetImage } from "../../components/AssetImage";
import { EmptyState } from "../../components/EmptyState";
import { WorkshopArt } from "../../components/WorkshopArt";
import { AskProductButton } from '../chat/ChatEntry';

export function LandingPage() {
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useProducts({
    page,
    size: 12,
  });
  const products = data?.content || [];
  return (
    <div className="landing-page">
      <section className="workshop-hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            Gói Ấm
            <br />
            <span>Trao Em</span>
          </h1>
          <p>
            Đồ ăn vặt &amp; quà lưu niệm.
            <br />
            Đặt online, nhận tại trường.
          </p>
          <a href="#catalog" className="btn-primary hero-cta">
            Xem sản phẩm <ArrowRight size={20} aria-hidden="true" />
          </a>
        </div>
        <div className="hero-atelier">
          <WorkshopArt />
        </div>
        <a href="#catalog" className="hero-scroll" aria-label="Xem gian hàng">
          <ArrowDown size={18} aria-hidden="true" />
        </a>
      </section>
      <section
        className="catalog-section container"
        id="catalog"
        aria-labelledby="catalog-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="catalog-title">Gian hàng</h2>
          </div>
        </div>
        {isLoading ? (
          <LoadingSpinner message="Đang tải sản phẩm…" />
        ) : error && !data ? (
          <ErrorMessage error={error} onRetry={refetch} />
        ) : products.length === 0 ? (
          <div className="catalog-empty">
            <div className="empty-shelf-art" aria-hidden="true">
              <Gift />
              <Cookie />
              <ShoppingBag />
              <span />
            </div>
            <EmptyState
              title="Chưa có sản phẩm"
              description="Ghé lại sau nhé."
            />
          </div>
        ) : (
          <div className="products-grid">
            {products.map((p) => (
              <article className="product-card" key={p.id} data-reveal>
                <Link
                  className="product-card-img-link"
                  to={`/products/${p.slug || p.id}`}
                >
                  {p.imageUrl ? (
                    <AssetImage
                      src={p.imageUrl}
                      alt={p.name}
                      className="product-card-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="product-img-placeholder">
                      <Gift size={48} aria-hidden="true" />
                      <span>Chưa có ảnh</span>
                    </div>
                  )}
                  {(p.isSoldOut || p.availableStock <= 0) && (
                    <span className="product-sold-tag">Hết hàng</span>
                  )}
                </Link>
                <div className="product-card-content">
                  <span className="product-card-cat">{p.categoryName}</span>
                  <h3 className="product-card-title">
                    <Link to={`/products/${p.slug || p.id}`}>{p.name}</Link>
                  </h3>
                  <p className="product-card-desc">{p.description}</p>
                  <div className="product-card-footer">
                    <div>
                      <span className="product-price">
                        {p.price.toLocaleString("vi-VN")} <small>đ</small>
                      </span>
                      <span className="product-stock">
                        {p.availableStock > 0
                          ? `Còn ${p.availableStock} món`
                          : "Đã hết hàng"}
                      </span>
                    </div>
                    <AddToCartButton kind="PRODUCT" catalogId={p.id} name={p.name} compact className="product-add" disabled={p.isSoldOut || p.availableStock <= 0} />
                  </div>
                  <AskProductButton product={p} compact />
                </div>
              </article>
            ))}
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="pagination-controls">
            <button
              className="btn-secondary-sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Trang trước
            </button>
            <span>
              Trang {page + 1} / {data.totalPages}
            </span>
            <button
              className="btn-secondary-sm"
              disabled={page + 1 >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
      </section>
      <section className="how-it-works container" id="how-it-works">
        <div className="section-heading">
          <div>
            <h2>Cách nhận hàng</h2>
          </div>
          <Link to="/account/orders" className="text-link">
            Đơn hàng của tôi <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <ol className="workshop-steps">
          <li>
            <span className="step-number">01</span>
            <ShoppingBag aria-hidden="true" />
            <h3>Chọn món</h3>
            <p>Thêm vào giỏ và đặt hàng.</p>
          </li>
          <li>
            <span className="step-number">02</span>
            <Clock3 aria-hidden="true" />
            <h3>Xác nhận đơn</h3>
            <p>Người bán liên hệ xác nhận thời gian nhận.</p>
          </li>
          <li>
            <span className="step-number">03</span>
            <MapPin aria-hidden="true" />
            <h3>Nhận hàng</h3>
            <p>Nhận tại điểm hẹn trong trường.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
