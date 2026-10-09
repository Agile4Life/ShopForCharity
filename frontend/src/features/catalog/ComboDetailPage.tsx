import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Plus, Minus, Layers } from 'lucide-react';
import { useComboDetail } from './api';
import { useCart } from '../cart/cart-context';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';

export const ComboDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: combo, isLoading, error, refetch } = useComboDetail(slug || '');
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingSpinner message="Đang tải thông tin combo..." />;
  }

  if (error || !combo) {
    return (
      <div className="container mt-4">
        <Link to="/" className="btn-back">
          <ArrowLeft size={16} /> Quay lại danh mục
        </Link>
        <ErrorMessage error={error || new Error('Không tìm thấy combo này')} onRetry={refetch} />
      </div>
    );
  }

  const handleAddToCart = () => {
    const res = addItem({
      kind: 'COMBO',
      catalogId: combo.id,
      quantity,
      name: combo.name,
      price: combo.price,
      imageUrl: combo.imageUrl,
      slug: combo.slug,
    });

    if (res.success) {
      setNotice(`Đã thêm ${quantity} combo vào giỏ hàng!`);
      setTimeout(() => setNotice(null), 3000);
    } else if (res.message) {
      alert(res.message);
    }
  };

  const isSoldOut = combo.isSoldOut || combo.availableStock <= 0;

  return (
    <div className="combo-detail-page container">
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
          {combo.imageUrl ? (
            <img src={combo.imageUrl} alt={combo.name} className="detail-img" />
          ) : (
            <div className="detail-img-placeholder">
              <Layers size={48} />
              <span>Ảnh combo</span>
            </div>
          )}
        </div>

        <div className="detail-info">
          <span className="badge badge-purple">Gói Combo Tiết Kiệm</span>
          <h1 className="detail-title">{combo.name}</h1>
          <div className="detail-price">{combo.price.toLocaleString('vi-VN')} đ</div>

          <div className="detail-stock-status">
            {isSoldOut ? (
              <span className="badge badge-red">Hết hàng</span>
            ) : (
              <span className="stock-available">Khả dụng: {combo.availableStock} combo</span>
            )}
          </div>

          <div className="detail-desc">
            <h3>Mô tả combo</h3>
            <p>{combo.description}</p>
          </div>

          <div className="combo-components-box">
            <h3>Các món thành phần trong gói combo:</h3>
            <ul className="component-list">
              {combo.items.map((item) => (
                <li key={item.productId} className="component-item">
                  <span className="component-name">{item.productName}</span>
                  <span className="component-qty">x{item.quantity} phần</span>
                </li>
              ))}
            </ul>
          </div>

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
                  onClick={() => setQuantity((q) => Math.min(Math.min(20, combo.availableStock), q + 1))}
                  disabled={quantity >= 20 || quantity >= combo.availableStock}
                  className="step-btn"
                  aria-label="Tăng"
                >
                  <Plus size={16} />
                </button>
              </div>

              <button type="button" onClick={handleAddToCart} className="btn-primary">
                <ShoppingCart size={18} /> Thêm combo vào giỏ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
