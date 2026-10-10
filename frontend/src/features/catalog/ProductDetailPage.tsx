import { QuantityControl } from "../../components/Usability";
import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Info,
  ShieldAlert,
  Thermometer,
} from "lucide-react";
import { useProductDetail } from "./api";
import { AddToCartButton } from "../cart/AddToCartButton";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { AssetImage } from "../../components/AssetImage";

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const {
    data: product,
    isLoading,
    error,
    refetch,
  } = useProductDetail(slug || "");
  const [quantity, setQuantity] = useState(1);

  if (isLoading) {
    return <LoadingSpinner message="Đang tải thông tin món..." />;
  }

  if (!product) {
    return (
      <div className="container mt-4">
        <Link to="/" className="btn-back">
          <ArrowLeft size={16} /> Quay lại danh mục
        </Link>
        <ErrorMessage
          error={error || new Error("Không tìm thấy sản phẩm này")}
          onRetry={refetch}
        />
      </div>
    );
  }

  const isSoldOut = product.isSoldOut || product.availableStock <= 0;

  return (
    <div className="product-detail-page container">
      <Link to="/#catalog" className="btn-back">
        <ArrowLeft size={16} aria-hidden="true" /> Gian hàng
      </Link>

      <div className="detail-layout">
        <div className="detail-media">
          {product.imageUrl ? (
            <AssetImage
              src={product.imageUrl}
              alt={product.name}
              className="detail-img"
            />
          ) : (
            <div className="detail-img-placeholder">Không có hình ảnh</div>
          )}
        </div>

        <div className="detail-info">
          <span className="badge badge-blue">
            {product.categoryName || "Sản phẩm"}
          </span>
          <h1 className="detail-title">{product.name}</h1>
          <div className="detail-price">
            {product.price.toLocaleString("vi-VN")} đ
          </div>

          <div className="detail-stock-status">
            {isSoldOut ? (
              <span className="badge badge-red">Hết hàng</span>
            ) : (
              <span className="stock-available">
                Còn {product.availableStock} sản phẩm
              </span>
            )}
          </div>

          <div className="detail-desc">
            <h3>Mô tả sản phẩm</h3>
            <p>{product.description}</p>
          </div>

          {/* Optional Food details (Spec 5.1) */}
          {(product.ingredients ||
            product.allergens ||
            product.preservationInstructions) && (
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
              <QuantityControl
                value={quantity}
                max={Math.min(20, product.availableStock)}
                onChange={setQuantity}
              />

              <AddToCartButton kind="PRODUCT" catalogId={product.id} name={product.name} quantity={quantity} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
