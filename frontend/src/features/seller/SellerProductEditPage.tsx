import { notifyError as notify } from "../../components/Usability";
import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Upload, Image as ImageIcon } from "lucide-react";
import {
  useSellerProductDetail,
  useSellerProductMutations,
  uploadAsset,
} from "./api";
import { useCategories } from "../catalog/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";

export const SellerProductEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== "new";
  const navigate = useNavigate();

  const { data: existingProduct, isLoading: loadingProduct } =
    useSellerProductDetail(id || "");
  const { data: categories = [] } = useCategories();
  const mutations = useSellerProductMutations();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(10000);
  const [stockOnHand, setStockOnHand] = useState<number>(10);
  const [imageAssetId, setImageAssetId] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [ingredients, setIngredients] = useState("");
  const [allergens, setAllergens] = useState("");
  const [preservationInstructions, setPreservationInstructions] = useState("");

  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name || "");
      setCategoryId(existingProduct.categoryId || "");
      setDescription(existingProduct.description || "");
      setPrice(existingProduct.price || 0);
      setStockOnHand(existingProduct.stockOnHand || 0);
      setImageAssetId(existingProduct.imageAssetId);
      setImageUrl(existingProduct.imageUrl);
      setIngredients(existingProduct.ingredients || "");
      setAllergens(existingProduct.allergens || "");
      setPreservationInstructions(
        existingProduct.preservationInstructions || "",
      );
    }
  }, [existingProduct]);

  const handleImageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      notify("Kích thước ảnh tối đa là 5MB!");
      return;
    }

    setUploadingImage(true);
    try {
      const res = await uploadAsset(file, "PRODUCT_IMAGE");
      setImageAssetId(res.assetId);
      setImageUrl(res.url);
    } catch (err: any) {
      notify(err.message || "Lỗi khi tải ảnh lên");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId || price <= 0) {
      notify("Vui lòng điền đầy đủ tên, danh mục và giá sản phẩm");
      return;
    }

    setSubmitError(null);
    try {
      if (isEditing && id) {
        await mutations.updateProduct.mutateAsync({
          id,
          data: {
            name: name.trim(),
            categoryId,
            description: description.trim(),
            price,
            imageAssetId,
            ingredients: ingredients.trim() || undefined,
            allergens: allergens.trim() || undefined,
            preservationInstructions:
              preservationInstructions.trim() || undefined,
            expectedVersion: existingProduct?.version ?? 0,
          },
        });
      } else {
        await mutations.createProduct.mutateAsync({
          name: name.trim(),
          categoryId,
          description: description.trim(),
          price,
          stockOnHand,
          imageAssetId,
          ingredients: ingredients.trim() || undefined,
          allergens: allergens.trim() || undefined,
          preservationInstructions:
            preservationInstructions.trim() || undefined,
        });
      }
      navigate("/seller/products");
    } catch (err) {
      setSubmitError(err);
    }
  };

  if (isEditing && loadingProduct) {
    return <LoadingSpinner message="Đang tải dữ liệu sản phẩm..." />;
  }

  return (
    <div className="seller-product-edit-page container max-w-2xl mx-auto">
      <Link to="/seller/products" className="btn-back mb-4">
        <ArrowLeft size={16} /> Quay lại danh sách sản phẩm
      </Link>

      <div className="card">
        <h1 className="page-title mb-4">
          {isEditing ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
        </h1>

        {submitError != null && (
          <div className="mb-4">
            <ErrorMessage error={submitError} />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Image Upload */}
          <div className="form-group mb-4">
            <label
              className="form-label"
              htmlFor="sellerproducteditpage-field-1"
            >
              Hình ảnh sản phẩm (JPEG, PNG, WebP tối đa 5MB):
            </label>
            <div className="image-upload-box flex items-center gap-4">
              <div className="preview-wrap">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="upload-preview-img"
                  />
                ) : (
                  <div className="upload-placeholder">
                    <ImageIcon size={32} />
                    <span className="text-xs">Chưa có ảnh</span>
                  </div>
                )}
              </div>

              <div>
                <label className="btn-secondary-sm cursor-pointer">
                  <Upload size={14} />{" "}
                  {uploadingImage ? "Đang tải lên..." : "Tải ảnh từ máy tính"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageFileChange}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                </label>
                {imageAssetId && (
                  <span className="block text-xs text-green mt-1">
                    Đã gắn Asset ID
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tên sản phẩm *:</label>
            <input
              id="sellerproducteditpage-field-1"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Bánh tráng phơi sương muối nhuyễn"
              className="input-field"
              required
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label
                className="form-label"
                htmlFor="sellerproducteditpage-field-2"
              >
                Danh mục *:
              </label>
              <select
                id="sellerproducteditpage-field-2"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="select-field"
                required
              >
                <option value="">-- Chọn danh mục --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label
                className="form-label"
                htmlFor="sellerproducteditpage-field-3"
              >
                Giá bán (VND) *:
              </label>
              <input
                id="sellerproducteditpage-field-3"
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                min={1000}
                step={1000}
                className="input-field"
                required
              />
            </div>
          </div>

          {!isEditing && (
            <div className="form-group">
              <label
                className="form-label"
                htmlFor="sellerproducteditpage-field-4"
              >
                Số lượng tồn kho ban đầu *:
              </label>
              <input
                id="sellerproducteditpage-field-4"
                type="number"
                value={stockOnHand}
                onChange={(e) => setStockOnHand(Number(e.target.value))}
                min={0}
                className="input-field"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label
              className="form-label"
              htmlFor="sellerproducteditpage-field-5"
            >
              Mô tả sản phẩm:
            </label>
            <textarea
              id="sellerproducteditpage-field-5"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả hương vị, quy cách đóng gói..."
              className="textarea-field"
            />
          </div>

          {/* Optional Food Metadata */}
          <div className="food-meta-inputs card bg-gray-subtle mt-4 mb-4">
            <h3 className="text-sm font-bold mb-3">
              Thông tin thực phẩm (tùy chọn):
            </h3>

            <div className="form-group">
              <label className="form-label text-xs">
                Thành phần nguyên liệu:
              </label>
              <input
                type="text"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                placeholder="Ví dụ: Bột gạo, muối tôm, hành phi, bơ trứng gà..."
                className="input-field text-sm"
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs">Cảnh báo dị ứng:</label>
              <input
                type="text"
                value={allergens}
                onChange={(e) => setAllergens(e.target.value)}
                placeholder="Ví dụ: Chứa tôm, đậu phộng, trứng..."
                className="input-field text-sm"
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs">Hướng dẫn bảo quản:</label>
              <input
                type="text"
                value={preservationInstructions}
                onChange={(e) => setPreservationInstructions(e.target.value)}
                placeholder="Ví dụ: Nơi khô ráo thoáng mát, dùng trong 7 ngày..."
                className="input-field text-sm"
              />
            </div>
          </div>

          <div className="form-actions mt-4">
            <button
              type="submit"
              disabled={
                mutations.createProduct.isPending ||
                mutations.updateProduct.isPending
              }
              className="btn-primary full-width"
            >
              {mutations.createProduct.isPending ||
              mutations.updateProduct.isPending
                ? "Đang lưu sản phẩm..."
                : isEditing
                  ? "Lưu thay đổi"
                  : "Thêm sản phẩm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
