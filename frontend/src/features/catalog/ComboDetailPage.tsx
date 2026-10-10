import { QuantityControl } from "../../components/Usability";
import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Layers } from "lucide-react";
import { useComboDetail } from "./api";
import { AddToCartButton } from "../cart/AddToCartButton";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { AssetImage } from "../../components/AssetImage";

export const ComboDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: combo, isLoading, error, refetch } = useComboDetail(slug || "");
  const [quantity, setQuantity] = useState(1);

  if (isLoading) {
    return <LoadingSpinner message="Đang tải thông tin combo..." />;
  }

  if (!combo) {
    return (
      <div className="container mt-4">
        <Link to="/" className="btn-back">
          <ArrowLeft size={16} /> Quay lại danh mục
        </Link>
        <ErrorMessage
          error={error || new Error("Không tìm thấy combo này")}
          onRetry={refetch}
        />
      </div>
    );
  }

  const isSoldOut = combo.isSoldOut || combo.availableStock <= 0;

  return (
    <div className="combo-detail-page container">
      <Link to="/#catalog" className="btn-back">
        <ArrowLeft size={16} aria-hidden="true" /> Gian hàng
      </Link>

      <div className="detail-layout">
        <div className="detail-media">
          {combo.imageUrl ? (
            <AssetImage src={combo.imageUrl} alt={combo.name} className="detail-img" />
          ) : (
            <div className="detail-img-placeholder">
              <Layers size={48} />
              <span>Ảnh combo</span>
            </div>
          )}
        </div>

        <div className="detail-info">
          <span className="badge badge-purple">Combo</span>
          <h1 className="detail-title">{combo.name}</h1>
          <div className="detail-price">
            {combo.price.toLocaleString("vi-VN")} đ
          </div>

          <div className="detail-stock-status">
            {isSoldOut ? (
              <span className="badge badge-red">Hết hàng</span>
            ) : (
              <span className="stock-available">
                Còn {combo.availableStock} combo
              </span>
            )}
          </div>

          <div className="detail-desc">
            <h3>Mô tả combo</h3>
            <p>{combo.description}</p>
          </div>

          <div className="combo-components-box">
            <h3>Trong combo có</h3>
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
              <QuantityControl
                value={quantity}
                max={Math.min(20, combo.availableStock)}
                onChange={setQuantity}
              />

              <AddToCartButton kind="COMBO" catalogId={combo.id} name={combo.name} quantity={quantity} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
