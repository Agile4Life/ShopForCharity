import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  Cookie,
  Gift,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useShopInfo, useCategories, useProducts, useCombos } from "./api";
import { useCart } from "../cart/cart-context";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";
import { WorkshopArt } from "../../components/WorkshopArt";

export function LandingPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  const { data: shop, error: shopError, refetch: refetchShop } = useShopInfo();
  const { data: categories = [] } = useCategories();
  const { data, isLoading, isFetching, error, refetch } = useProducts({
    q: query,
    category,
    sort,
    page,
    size: 12,
  });
  const {
    data: combos = [],
    isLoading: combosLoading,
    error: combosError,
    refetch: refetchCombos,
  } = useCombos();
  const { addItem } = useCart();
  const products = data?.content || [];
  function add(item: {
    kind: "PRODUCT" | "COMBO";
    catalogId: string;
    name: string;
    price: number;
    imageUrl?: string;
    slug?: string;
  }) {
    const result = addItem(item);
    setNotice(
      result.success
        ? `Đã thêm ${item.name} vào giỏ đồ.`
        : result.message || "Chưa thể thêm món này.",
    );
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }
  return (
    <div className="landing-page">
      {notice && (
        <div className="toast-notification" role="status">
          <Check size={18} aria-hidden="true" />
          {notice}
          <Link to="/cart">Xem giỏ</Link>
        </div>
      )}
      <section className="workshop-hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            Gói Ấm
            <br />
            <span>Cho Em</span>
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
        data-reveal
      >
        <div className="section-heading">
          <div>
            <h2 id="catalog-title">Gian hàng</h2>
          </div>
        </div>
        {shopError ? (
          <ErrorMessage error={shopError} onRetry={refetchShop} />
        ) : (
          shop && (
            <div
              className={`shop-status-strip ${shop.acceptingOrders ? "is-open" : ""}`}
            >
              <span className="status-dot" />
              <span>
                {shop.acceptingOrders
                  ? "Đang nhận đơn"
                  : "Tạm dừng nhận đơn mới"}
              </span>
              {shop.pickupPoints.some((p) => p.active) && (
                <span className="status-pickup">
                  <MapPin size={15} aria-hidden="true" />
                  Nhận tại trường
                </span>
              )}
            </div>
          )
        )}
        <div className="catalog-toolbar">
          <div className="category-tabs" role="group" aria-label="Lọc danh mục">
            <button
              className={category === "" ? "active" : ""}
              aria-pressed={category === ""}
              onClick={() => {
                setCategory("");
                setPage(0);
              }}
            >
              Tất cả món
            </button>
            {categories
              .filter((c) => c.active)
              .map((c) => (
                <button
                  key={c.id}
                  className={category === (c.code || c.id) ? "active" : ""}
                  aria-pressed={category === (c.code || c.id)}
                  onClick={() => {
                    setCategory(c.code || c.id);
                    setPage(0);
                  }}
                >
                  {c.code === "SNACK" ? (
                    <Cookie size={17} aria-hidden="true" />
                  ) : (
                    <Gift size={17} aria-hidden="true" />
                  )}
                  {c.name}
                </button>
              ))}
          </div>
          <div className="catalog-tools">
            <div className="search-box">
              <Search size={18} className="search-icon" aria-hidden="true" />
              <input
                aria-label="Tìm món trong gian hàng"
                type="search"
                placeholder="Tìm món bạn thích…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
              {search && (
                <button
                  type="button"
                  className="clear-search"
                  aria-label="Xóa từ khóa tìm kiếm"
                  onClick={() => {
                    setSearch("");
                    setQuery("");
                    setPage(0);
                  }}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            <select
              aria-label="Sắp xếp sản phẩm"
              className="select-input"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Sắp xếp</option>
              <option value="price,asc">Giá tăng dần</option>
              <option value="price,desc">Giá giảm dần</option>
              <option value="name,asc">Tên A–Z</option>
            </select>
          </div>
        </div>
        <div className="catalog-results">
          <span role="status">
            {isFetching
              ? "Đang tìm sản phẩm…"
              : `${data?.totalElements ?? 0} sản phẩm`}
          </span>
          {(query || category || sort) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setQuery("");
                setCategory("");
                setSort("");
                setPage(0);
              }}
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
        {isLoading ? (
          <LoadingSpinner message="Đang tải sản phẩm…" />
        ) : error ? (
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
              title={
                query || category
                  ? "Không tìm thấy sản phẩm"
                  : "Chưa có sản phẩm"
              }
              description={
                query || category
                  ? "Thử từ khóa hoặc danh mục khác."
                  : "Ghé lại sau nhé."
              }
              actionText={query || category ? "Xem tất cả món" : undefined}
              onAction={() => {
                setSearch("");
                setQuery("");
                setCategory("");
                setPage(0);
              }}
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
                    <img
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
                    <button
                      className="product-add"
                      aria-label={`Thêm ${p.name} vào giỏ`}
                      disabled={p.isSoldOut || p.availableStock <= 0}
                      onClick={() =>
                        add({
                          kind: "PRODUCT",
                          catalogId: p.id,
                          name: p.name,
                          price: p.price,
                          imageUrl: p.imageUrl,
                          slug: p.slug,
                        })
                      }
                    >
                      <Plus size={23} aria-hidden="true" />
                    </button>
                  </div>
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
      <section
        className={`combo-workshop container${!combosLoading && !combosError && combos.length === 0 ? " combo-empty-section" : ""}`}
        id="combos"
        aria-labelledby="combo-title"
        data-reveal
      >
        <div className="combo-intro">
          <h2 id="combo-title">Combo</h2>
        </div>
        <div className="combo-content">
          {combosLoading ? (
            <LoadingSpinner message="Đang tải combo…" />
          ) : combosError ? (
            <ErrorMessage error={combosError} onRetry={refetchCombos} />
          ) : combos.length === 0 ? (
            <div className="combo-coming-soon">
              <Gift size={36} strokeWidth={1.4} aria-hidden="true" />
              <h3>Chưa có combo</h3>
            </div>
          ) : (
            <div className="combos-grid">
              {combos.map((c) => (
                <article className="combo-card" key={c.id}>
                  <div className="combo-card-content">
                    <h3 className="combo-card-title">
                      <Link to={`/combos/${c.slug || c.id}`}>{c.name}</Link>
                    </h3>
                    {c.imageUrl && (
                      <img
                        className="combo-card-img"
                        src={c.imageUrl}
                        alt={c.name}
                        loading="lazy"
                      />
                    )}
                    <p className="combo-description">{c.description}</p>
                    <p className="combo-items-list">
                      {c.items
                        .map((i) => `${i.productName} ×${i.quantity}`)
                        .join(" · ")}
                    </p>
                    <div className="combo-card-footer">
                      <span className="price-tag">
                        {c.price.toLocaleString("vi-VN")} đ
                      </span>
                      <span className="text-sm">
                        {c.availableStock > 0
                          ? `Còn ${c.availableStock} gói`
                          : "Hết hàng"}
                      </span>
                    </div>
                    <button
                      className="btn-primary-sm full-width mt-3"
                      disabled={c.isSoldOut || c.availableStock <= 0}
                      onClick={() =>
                        add({
                          kind: "COMBO",
                          catalogId: c.id,
                          name: c.name,
                          price: c.price,
                          imageUrl: c.imageUrl,
                          slug: c.slug,
                        })
                      }
                    >
                      <Plus size={17} aria-hidden="true" />
                      Thêm vào giỏ
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="how-it-works container" id="how-it-works" data-reveal>
        <div className="section-heading">
          <div>
            <h2>Cách nhận hàng</h2>
          </div>
          <Link to="/guest-order" className="text-link">
            Tra cứu đơn <ArrowRight size={18} aria-hidden="true" />
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
