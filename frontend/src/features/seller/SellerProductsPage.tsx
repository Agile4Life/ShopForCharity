import { notifyError as notify } from "../../components/Usability";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Plus,
  Edit,
  Sliders,
  Archive,
  CheckCircle,
} from "lucide-react";
import { useSellerProducts, useSellerProductMutations } from "./api";
import { ProductStatusBadge } from "../../components/StatusBadge";
import { Modal } from "../../components/Modal";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import type { ProductSummary } from "../../types/api";
import { AssetImage } from "../../components/AssetImage";

export const SellerProductsPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useSellerProducts(page, 20);
  const mutations = useSellerProductMutations();

  // Stock Adjustment Modal state
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(
    null,
  );
  const [deltaOnHand, setDeltaOnHand] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>("");

  const products = data?.content || [];

  const handleOpenAdjust = (prod: ProductSummary) => {
    setSelectedProduct(prod);
    setDeltaOnHand(0);
    setAdjustReason("");
    setAdjustModalOpen(true);
  };

  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || mutations.adjustStock.isPending) return;
    if (deltaOnHand === 0) {
      notify("Thay đổi tồn kho phải khác 0 (+ hoặc -)");
      return;
    }
    if (!adjustReason.trim()) {
      notify("Vui lòng nhập lý do điều chỉnh tồn kho");
      return;
    }

    try {
      await mutations.adjustStock.mutateAsync({
        id: selectedProduct.id,
        data: {
          deltaOnHand,
          reason: adjustReason.trim(),
          expectedVersion:
            selectedProduct.inventoryVersion ?? selectedProduct.version ?? 0,
        },
      });
    } catch (error) {
      notify(error);
      return;
    }
    setAdjustModalOpen(false);
  };

  return (
    <div className="seller-products-page container">
      <div className="flex-between mb-4">
        <div>
          <h1 className="page-title">
            <Package size={24} /> Quản lý Sản phẩm
          </h1>
          <p className="text-muted text-sm">
            Danh mục đồ ăn vặt và đồ lưu niệm của shop
          </p>
        </div>
        <Link to="/seller/products/new" className="btn-primary">
          <Plus size={16} /> Thêm sản phẩm mới
        </Link>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Đang tải danh sách sản phẩm..." />
      ) : error && !data ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Danh mục</th>
                  <th className="text-right">Giá bán</th>
                  <th className="text-center">Tồn khả dụng</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <AssetImage
                            src={p.imageUrl}
                            alt={p.name}
                            className="table-thumb"
                          />
                        ) : (
                          <div className="table-thumb-placeholder">Món</div>
                        )}
                        <div>
                          <strong>{p.name}</strong>
                          <span className="block text-xs text-muted">
                            {p.slug}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Danh mục">
                      {p.categoryName || "Mặc định"}
                    </td>
                    <td className="text-right font-medium" data-label="Giá">
                      {p.price.toLocaleString("vi-VN")} đ
                    </td>
                    <td className="text-center" data-label="Có thể bán">
                      <span
                        className={
                          p.availableStock > 0
                            ? "text-green font-bold"
                            : "text-red font-bold"
                        }
                      >
                        {p.availableStock}
                      </span>
                    </td>
                    <td data-label="Trạng thái">
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td className="text-right">
                      <div className="action-buttons-group">
                        <button
                          type="button"
                          onClick={() => handleOpenAdjust(p)}
                          className="btn-secondary-xs"
                          title="Điều chỉnh tồn kho"
                        >
                          <Sliders size={14} /> Tồn kho
                        </button>

                        <Link
                          to={`/seller/products/${p.id}/edit`}
                          className="btn-secondary-xs"
                          title="Sửa thông tin"
                        >
                          <Edit size={14} /> Sửa
                        </Link>

                        {p.status === "ACTIVE" ? (
                          <button
                            type="button"
                            onClick={() =>
                              mutations.archiveProduct.mutate({
                                id: p.id,
                                expectedVersion: p.version ?? 0,
                              })
                            }
                            disabled={Object.values(mutations).some(
                              (mutation) => mutation.isPending,
                            )}
                            className="btn-danger-xs"
                            title="Ẩn sản phẩm"
                          >
                            <Archive size={14} /> Ẩn
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              mutations.activateProduct.mutate({
                                id: p.id,
                                expectedVersion: p.version ?? 0,
                              })
                            }
                            disabled={Object.values(mutations).some(
                              (mutation) => mutation.isPending,
                            )}
                            className="btn-primary-xs"
                            title="Mở bán sản phẩm"
                          >
                            <CheckCircle size={14} /> Mở bán
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="pagination-controls">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary-sm"
              >
                Trang trước
              </button>
              <span className="pagination-info">
                Trang {page + 1} / {data.totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages - 1, p + 1))
                }
                disabled={page >= data.totalPages - 1}
                className="btn-secondary-sm"
              >
                Trang sau
              </button>
            </div>
          )}
        </div>
      )}

      {/* Adjust Stock Modal */}
      <Modal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title={`Điều chỉnh tồn kho: ${selectedProduct?.name}`}
        closeDisabled={mutations.adjustStock.isPending}
      >
        <form onSubmit={handleConfirmAdjust}>
          <div className="form-group">
            <label className="form-label" htmlFor="sellerproductspage-field-1">
              Số lượng điều chỉnh (nhập số dương để tăng, số âm để giảm):
            </label>
            <input
              id="sellerproductspage-field-1"
              type="number"
              value={deltaOnHand}
              onChange={(e) => setDeltaOnHand(Number(e.target.value))}
              placeholder="Ví dụ: +10 hoặc -5"
              className="input-field"
              required
            />
            <span className="text-xs text-muted">
              Tồn khả dụng hiện tại:{" "}
              <strong>{selectedProduct?.availableStock}</strong>
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sellerproductspage-field-2">
              Lý do điều chỉnh (bắt buộc):
            </label>
            <textarea
              id="sellerproductspage-field-2"
              rows={2}
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Ví dụ: Nhập thêm hàng mới từ nhà cung cấp / Hỏng hóc..."
              className="textarea-field"
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setAdjustModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={mutations.adjustStock.isPending}
              className="btn-primary"
            >
              {mutations.adjustStock.isPending
                ? "Đang cập nhật..."
                : "Lưu điều chỉnh"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
