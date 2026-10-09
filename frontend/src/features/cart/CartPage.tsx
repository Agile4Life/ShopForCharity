import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ArrowRight, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useCart } from './cart-context';
import { EmptyState } from '../../components/EmptyState';

export const CartPage: React.FC = () => {
  const { items, updateQuantity, removeItem, clearCart, estimatedSubtotal } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="cart-page container">
        <EmptyState
          title="Giỏ hàng của bạn đang trống"
          description="Hãy chọn một vài món đồ ăn vặt hoặc quà lưu niệm để bắt đầu đặt đơn nhé!"
          actionText="Tiếp tục mua sắm"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  return (
    <div className="cart-page container">
      <div className="cart-header">
        <h1 className="page-title">
          <ShoppingBag size={24} /> Giỏ hàng ({items.length} loại món)
        </h1>
        <button type="button" onClick={clearCart} className="btn-text-danger">
          Xóa toàn bộ giỏ
        </button>
      </div>

      <div className="cart-layout">
        <div className="cart-items-list">
          {items.map((item) => (
            <div key={`${item.kind}-${item.catalogId}`} className="cart-item-card">
              <div className="cart-item-thumb">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name || 'Sản phẩm'} />
                ) : (
                  <div className="thumb-placeholder">{item.kind === 'COMBO' ? 'Combo' : 'Món'}</div>
                )}
              </div>

              <div className="cart-item-details">
                <span className="badge badge-gray text-xs">{item.kind === 'COMBO' ? 'Combo' : 'Món lẻ'}</span>
                <h3 className="cart-item-name">{item.name || 'Sản phẩm'}</h3>
                <div className="cart-item-price">
                  {item.price ? `${item.price.toLocaleString('vi-VN')} đ` : 'Chờ báo giá'}
                </div>
              </div>

              <div className="cart-item-stepper">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.catalogId, item.quantity - 1)}
                  className="step-btn"
                  aria-label="Giảm"
                >
                  <Minus size={14} />
                </button>
                <span className="quantity-val">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.catalogId, item.quantity + 1)}
                  disabled={item.quantity >= 20}
                  className="step-btn"
                  aria-label="Tăng"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="cart-item-subtotal">
                {item.price ? `${(item.price * item.quantity).toLocaleString('vi-VN')} đ` : ''}
              </div>

              <button
                type="button"
                onClick={() => removeItem(item.catalogId)}
                className="cart-item-remove-btn"
                title="Xóa món này"
                aria-label="Xóa món"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="cart-summary-card">
          <h2 className="summary-title">Tạm tính đơn hàng</h2>
          <div className="summary-row">
            <span>Tổng tiền dự kiến:</span>
            <strong className="summary-total">{estimatedSubtotal.toLocaleString('vi-VN')} đ</strong>
          </div>
          <p className="summary-note text-muted text-xs">
            * Giá chính thức và tình trạng tồn kho sẽ được kiểm tra và khóa giá khi tiến hành đặt hàng.
          </p>

          <button
            type="button"
            onClick={() => navigate('/checkout')}
            className="btn-primary full-width mt-4"
          >
            Tiến hành đặt hàng <ArrowRight size={18} />
          </button>

          <Link to="/" className="btn-secondary full-width mt-2">
            <ArrowLeft size={16} /> Tiếp tục chọn món
          </Link>
        </div>
      </div>
    </div>
  );
};
