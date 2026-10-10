import { Link } from "react-router-dom";
import { Trash2, ArrowRight, ArrowLeft, ShoppingBag } from "lucide-react";
import { useCart } from "./cart-context";
import { useShopInfo } from "../catalog/api";
import {
  PurchaseSteps,
  QuantityControl,
  notify,
} from "../../components/Usability";
import type { CartItem } from "../../types/api";
import { AssetImage } from "../../components/AssetImage";
import { ErrorMessage } from "../../components/ErrorMessage";

export function CartPage() {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    restoreItems,
    estimatedSubtotal,
    totalQuantity,
  } = useCart();
  const { data: shop, isLoading: shopLoading, error: shopError, refetch: refetchShop } = useShopInfo();
  const remove = (removed: CartItem[]) => {
    if (removed.length === items.length) clearCart();
    else removed.forEach((item) => removeItem(item.catalogId, item.kind));
    notify(
      removed.length === 1
        ? `Đã xóa ${removed[0].name || "món"} khỏi giỏ.`
        : "Đã xóa giỏ hàng.",
      { action: { label: "Hoàn tác", onClick: () => restoreItems(removed) } },
    );
  };
  return (
    <div className="cart-page container">
      <PurchaseSteps step={1} />
      <div className="cart-header">
        <h1 className="page-title">
          <ShoppingBag size={24} aria-hidden="true" /> Giỏ hàng
        </h1>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => remove(items)}
            className="btn-text-danger"
          >
            Xóa tất cả
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="empty-cart-view">
          <ShoppingBag size={54} strokeWidth={1.3} aria-hidden="true" />
          <h2>Giỏ hàng đang trống</h2>
          <Link to="/#catalog" className="btn-primary">
            Chọn sản phẩm <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items-list">
            <p className="cart-item-count" aria-live="polite">
              {totalQuantity} món · {items.length} loại
            </p>
            {items.map((item) => (
              <article
                key={`${item.kind}-${item.catalogId}`}
                className="cart-item-card"
              >
                <Link
                  to={`/${item.kind === "COMBO" ? "combos" : "products"}/${item.slug || item.catalogId}`}
                  className="cart-item-thumb"
                  aria-label={`Xem ${item.name || "sản phẩm"}`}
                >
                  {item.imageUrl ? (
                    <AssetImage src={item.imageUrl} alt={item.name || "Sản phẩm"} />
                  ) : (
                    <div className="thumb-placeholder">
                      {item.kind === "COMBO" ? "Combo" : "Món"}
                    </div>
                  )}
                </Link>
                <div className="cart-item-details">
                  {item.kind === "COMBO" && (
                    <span className="badge badge-gray text-xs">Combo</span>
                  )}
                  <h2 className="cart-item-name">
                    <Link
                      to={`/${item.kind === "COMBO" ? "combos" : "products"}/${item.slug || item.catalogId}`}
                    >
                      {item.name || "Sản phẩm"}
                    </Link>
                  </h2>
                  <div className="cart-item-price">
                    {item.price != null
                      ? `${item.price.toLocaleString("vi-VN")} đ / món`
                      : "Chờ cập nhật giá"}
                  </div>
                </div>
                <div className="cart-item-stepper">
                  <QuantityControl
                    value={item.quantity}
                    label={`Số lượng ${item.name || "sản phẩm"}`}
                    onChange={(quantity) =>
                      updateQuantity(item.catalogId, quantity, item.kind)
                    }
                  />
                </div>
                <div className="cart-item-subtotal">
                  {item.price != null
                    ? `${(item.price * item.quantity).toLocaleString("vi-VN")} đ`
                    : ""}
                </div>
                <button
                  type="button"
                  onClick={() => remove([item])}
                  className="cart-item-remove-btn"
                  aria-label={`Xóa ${item.name || "món"}`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </article>
            ))}
            <Link to="/#catalog" className="text-link cart-continue">
              <ArrowLeft size={17} aria-hidden="true" /> Chọn thêm món
            </Link>
          </div>
          <aside className="cart-summary-card">
            <h2 className="summary-title">Tạm tính</h2>
            <div className="summary-row">
              <span>{totalQuantity} món</span>
              <strong className="summary-total">
                {estimatedSubtotal.toLocaleString("vi-VN")} đ
              </strong>
            </div>
            <p className="summary-note text-muted">
              Giá và số lượng sẽ được kiểm tra ở bước tiếp theo.
            </p>
            {shopError && !shop && <ErrorMessage error={shopError} onRetry={refetchShop} />}
            {shop && !shop.acceptingOrders && (
              <p className="cart-closed-note">
                Shop tạm dừng nhận đơn. Bạn vẫn có thể lưu món trong giỏ.
              </p>
            )}
            {shop?.acceptingOrders ? (
              <Link to="/checkout" className="btn-primary full-width mt-4">
                Tiếp tục đặt hàng <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                className="btn-primary full-width mt-4"
                disabled
              >
                {shop ? "Tạm dừng nhận đơn" : shopLoading ? "Đang kiểm tra shop…" : "Chưa kiểm tra được shop"}
              </button>
            )}
            <p className="checkout-guest-note">Không cần tạo tài khoản.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
