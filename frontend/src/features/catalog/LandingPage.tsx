import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingCart, AlertTriangle, Layers, MapPin, Phone, Mail } from 'lucide-react';
import { useShopInfo, useCategories, useProducts, useCombos } from './api';
import { useCart } from '../cart/cart-context';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { EmptyState } from '../../components/EmptyState';

export const LandingPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('');

  const { data: shop } = useShopInfo();
  const { data: categories = [] } = useCategories();
  const {
    data: productsData,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts({
    q: searchQuery,
    category: selectedCategory,
    sort: sortBy,
  });
  const { data: combos = [], isLoading: combosLoading } = useCombos();

  const { addItem } = useCart();
  const [addNotice, setAddNotice] = useState<string | null>(null);

  const handleAddToCart = (
    item: {
      kind: 'PRODUCT' | 'COMBO';
      catalogId: string;
      name: string;
      price: number;
      imageUrl?: string;
      slug?: string;
    }
  ) => {
    const res = addItem(item);
    if (res.success) {
      setAddNotice(`Đã thêm "${item.name}" vào giỏ hàng!`);
      setTimeout(() => setAddNotice(null), 3000);
    } else if (res.message) {
      alert(res.message);
    }
  };

  const products = productsData?.content || [];

  return (
    <div className="landing-page container">
      {/* Toast Notice */}
      {addNotice && (
        <div className="toast-notification" role="status">
          {addNotice}
        </div>
      )}

      {/* Shop Info Header Banner */}
      {shop && (
        <section className="shop-hero-card">
          <div className="shop-hero-header">
            <h1 className="shop-title">{shop.name || 'Website Bán Hàng Học Đường'}</h1>
            {!shop.acceptingOrders && (
              <div className="shop-closed-alert">
                <AlertTriangle size={18} />
                <span>Shop hiện đang tạm dừng nhận đơn mới. Quý khách vui lòng quay lại sau!</span>
              </div>
            )}
          </div>
          <div className="shop-contact-bar">
            {shop.contactPhone && (
              <span className="contact-item">
                <Phone size={14} /> {shop.contactPhone}
              </span>
            )}
            {shop.contactEmail && (
              <span className="contact-item">
                <Mail size={14} /> {shop.contactEmail}
              </span>
            )}
            {shop.pickupPoints && shop.pickupPoints.length > 0 && (
              <span className="contact-item">
                <MapPin size={14} /> Điểm nhận: {shop.pickupPoints.filter(p => p.active).map(p => p.name).join(', ')}
              </span>
            )}
          </div>
        </section>
      )}

      {/* Combos Section (Tiết kiệm khi mua combo) */}
      <section className="combos-section">
        <div className="section-title-wrap">
          <Layers size={22} className="section-icon" />
          <h2 className="section-title">Combo Tiết Kiệm</h2>
        </div>

        {combosLoading ? (
          <LoadingSpinner message="Đang tải danh sách combo..." />
        ) : combos.length === 0 ? (
          <p className="text-muted">Hiện chưa có gói combo nào.</p>
        ) : (
          <div className="combos-grid">
            {combos.map((combo) => (
              <div key={combo.id} className="combo-card">
                {combo.imageUrl && (
                  <img src={combo.imageUrl} alt={combo.name} className="combo-card-img" />
                )}
                <div className="combo-card-content">
                  <h3 className="combo-card-title">
                    <Link to={`/combos/${combo.slug || combo.id}`}>{combo.name}</Link>
                  </h3>
                  <p className="combo-description">{combo.description}</p>
                  <div className="combo-items-list">
                    <strong>Gồm có: </strong>
                    {combo.items.map((i, idx) => (
                      <span key={i.productId} className="combo-subitem">
                        {i.productName} (x{i.quantity}){idx < combo.items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                  <div className="combo-card-footer">
                    <div className="price-tag">{combo.price.toLocaleString('vi-VN')} đ</div>
                    <div className="stock-info">
                      {combo.isSoldOut || combo.availableStock <= 0 ? (
                        <span className="badge badge-red">Hết hàng</span>
                      ) : (
                        <span className="stock-qty">Còn {combo.availableStock} combo</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary-sm full-width mt-2"
                    disabled={combo.isSoldOut || combo.availableStock <= 0}
                    onClick={() =>
                      handleAddToCart({
                        kind: 'COMBO',
                        catalogId: combo.id,
                        name: combo.name,
                        price: combo.price,
                        imageUrl: combo.imageUrl,
                        slug: combo.slug,
                      })
                    }
                  >
                    <ShoppingCart size={16} /> Thêm combo vào giỏ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Catalog Search & Filter Controls */}
      <section className="catalog-section">
        <div className="catalog-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm kiếm đồ ăn vặt, quà lưu niệm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-group">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="select-input"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.code || c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="select-input"
            >
              <option value="">Sắp xếp mặc định</option>
              <option value="price,asc">Giá tăng dần</option>
              <option value="price,desc">Giá giảm dần</option>
              <option value="name,asc">Tên A-Z</option>
            </select>
          </div>
        </div>

        {/* Products Grid */}
        {productsLoading ? (
          <LoadingSpinner message="Đang tải danh sách món..." />
        ) : productsError ? (
          <ErrorMessage error={productsError} onRetry={refetchProducts} />
        ) : products.length === 0 ? (
          <EmptyState
            title="Không tìm thấy sản phẩm"
            description="Hãy thử đổi từ khóa tìm kiếm hoặc chọn danh mục khác."
          />
        ) : (
          <div className="products-grid">
            {products.map((p) => (
              <div key={p.id} className="product-card">
                <Link to={`/products/${p.slug || p.id}`} className="product-card-img-link">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="product-card-img" />
                  ) : (
                    <div className="product-img-placeholder">Không có ảnh</div>
                  )}
                </Link>

                <div className="product-card-content">
                  <span className="product-card-cat">{p.categoryName || 'Ăn vặt & Quà tặng'}</span>
                  <h3 className="product-card-title">
                    <Link to={`/products/${p.slug || p.id}`}>{p.name}</Link>
                  </h3>
                  <p className="product-card-desc">{p.description}</p>

                  <div className="product-card-footer">
                    <span className="product-price">{p.price.toLocaleString('vi-VN')} đ</span>
                    {p.isSoldOut || p.availableStock <= 0 ? (
                      <span className="badge badge-red">Hết hàng</span>
                    ) : (
                      <span className="product-stock text-muted">Còn {p.availableStock}</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-primary-sm full-width mt-2"
                    disabled={p.isSoldOut || p.availableStock <= 0}
                    onClick={() =>
                      handleAddToCart({
                        kind: 'PRODUCT',
                        catalogId: p.id,
                        name: p.name,
                        price: p.price,
                        imageUrl: p.imageUrl,
                        slug: p.slug,
                      })
                    }
                  >
                    <ShoppingCart size={16} /> Thêm vào giỏ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
