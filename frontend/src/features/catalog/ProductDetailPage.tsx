import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Plus, Minus, Info, ShieldAlert, Thermometer } from 'lucide-react';
import { useProductDetail } from './api';
import { useCart } from '../cart/cart-context';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: product, isLoading, error, refetch } = useProductDetail(slug || '');
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingSpinner message="Đang tải thông tin món..." />;
  }

  if (error || !product) {
    return (
      <div className="container mt-4">
        <Link to="/" className="btn-back">
          <ArrowLeft size={16} /> Quay lại danh mục
        </Link>
        <ErrorMessage error={error || new Error('Không tìm thấy sản phẩm này')} onRetry={refetch} />
      </div>
    );
  }

  const handleAddToCart = () => {
    const res = addItem({
      kind: 'PRODUCT',
      catalogId: product.id,
      quantity,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      slug: product.slug,
    });

    if (res.success) {
      setNotice(`Đã thêm ${quantity} món vào giỏ hàng!`);
      setTimeout(() => setNotice(null), 3000);
    } else if (res.message) {
      alert(res.message);
    }
  };

  const isSoldOut = product.isSoldOut || product.availableStock <= 0;

  return (
    <div className="product-detail-page container">
      {notice && (
        <div className="toast-notification" role="status">
          {notice}
        </div>
      )}

      <button type="button" onClick={() => navigate(-1)} className="btn-back">
        <ArrowLeft size={16} /> Quay lại
      </button>

      <div className="detail-layout">
        <div className="detail-media">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="detail-img" />
          ) : (
            <div className="detail-img-placeholder">Không có hình ảnh</div>
          )}
        </div>

        <div className="detail-info">
          <span className="badge badge-blue">{product.categoryName || 'Sản phẩm'}</span>
          <h1 className="detail-title">{product.name}</h1>
          <div className="detail-price">{product.price.toLocaleString('vi-VN')} đ</div>

          <div className="detail-stock-status">
            {isSoldOut ? (
              <span className="badge badge-red">Hết hàng</span>
            ) : (
              <span className="stock-available">Còn sẵn: {product.availableStock} sản phẩm</span>
            )}
          </div>

          <div className="detail-desc">
            <h3>Mô tả sản phẩm</h3>
            <p>{product.description}</p>
          </div>

          {/* Optional Food details (Spec 5.1) */}
          {(product.ingredients || product.allergens || product.preservationInstructions) && (
            <div className="food-meta-box">
              {product.ingredients && (
                <div className="meta-row">
                  <Info size={16} className="meta-icon" />
                  <div>
                    <strong>Thành phần: </strong>
                    <span>{product.ingredients}</span>
                  </div>
                </div>
              )}
              {product.allergens && (
                <div className="meta-row">
                  <ShieldAlert size={16} className="meta-icon text-red" />
                  <div>
                    <strong>Cảnh báo dị ứng: </strong>
                    <span>{product.allergens}</span>
                  </div>
                </div>
              )}
              {product.preservationInstructions && (
                <div className="meta-row">
                  <Thermometer size={16} className="meta-icon text-blue" />
                  <div>
                    <strong>Bảo quản: </strong>
                    <span>{product.preservationInstructions}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quantity Selector & Add to Cart */}
          {!isSoldOut && (
            <div className="add-cart-section">
              <div className="quantity-stepper">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="step-btn"
                  aria-label="Giảm"
                >
                  <Minus size={16} />
                </button>
                <span className="quantity-val">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(Math.min(20, product.availableStock), q + 1))}
                  disabled={quantity >= 20 || quantity >= product.availableStock}
                  className="step-btn"
                  aria-label="Tăng"
                >
                  <Plus size={16} />
                </button>
              </div>

              <button type="button" onClick={handleAddToCart} className="btn-primary">
                <ShoppingCart size={18} /> Thêm vào giỏ hàng
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
