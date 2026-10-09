import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload, Layers } from 'lucide-react';
import {
  useSellerComboDetail,
  useSellerComboMutations,
  useSellerProducts,
  uploadAsset,
} from './api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';

export const SellerComboEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== 'new';
  const navigate = useNavigate();

  const { data: existingCombo, isLoading: loadingCombo } = useSellerComboDetail(id || '');
  const { data: productsData } = useSellerProducts(0, 100);
  const mutations = useSellerComboMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(20000);
  const [imageAssetId, setImageAssetId] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [items, setItems] = useState<Array<{ productId: string; quantity: number }>>([
    { productId: '', quantity: 1 },
    { productId: '', quantity: 1 },
  ]);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  const availableProducts = (productsData?.content || []).filter((p) => p.status === 'ACTIVE');

  useEffect(() => {
    if (existingCombo) {
      setName(existingCombo.name || '');
      setDescription(existingCombo.description || '');
      setPrice(existingCombo.price || 0);
      setImageAssetId(existingCombo.imageAssetId);
      setImageUrl(existingCombo.imageUrl);
      if (existingCombo.items && existingCombo.items.length > 0) {
        setItems(existingCombo.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
      }
    }
  }, [existingCombo]);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const res = await uploadAsset(file, 'PRODUCT_IMAGE');
      setImageAssetId(res.assetId);
      setImageUrl(res.url);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tải ảnh lên');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { productId: '', quantity: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 2) {
      alert('Một gói combo cần tối thiểu ít nhất 2 sản phẩm thành phần!');
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: 'productId' | 'quantity', value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation according to Spec 5.2
    if (!name.trim() || price <= 0) {
      alert('Vui lòng nhập tên và giá combo hợp lệ!');
      return;
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length < 2) {
      alert('Combo phải chứa từ 2 sản phẩm thành phần trở lên!');
      return;
    }

    // Merge duplicates
    const itemMap = new Map<string, number>();
    for (const it of validItems) {
      itemMap.set(it.productId, (itemMap.get(it.productId) || 0) + it.quantity);
    }
    const mergedItems = Array.from(itemMap.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    if (mergedItems.length < 2) {
      alert('Combo phải chứa từ 2 sản phẩm KHÁC NHAU trở lên!');
      return;
    }

    setSubmitError(null);
    try {
      if (isEditing && id) {
        await mutations.updateCombo.mutateAsync({
          id,
          data: {
            name: name.trim(),
            description: description.trim(),
            price,
            imageAssetId,
            items: mergedItems,
            expectedVersion: existingCombo?.version ?? 0,
          },
        });
      } else {
        await mutations.createCombo.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          price,
          imageAssetId,
          items: mergedItems,
        });
      }
      navigate('/seller/combos');
    } catch (err) {
      setSubmitError(err);
    }
  };

  if (isEditing && loadingCombo) {
    return <LoadingSpinner message="Đang tải dữ liệu combo..." />;
  }

  return (
    <div className="seller-combo-edit-page container max-w-2xl mx-auto">
      <Link to="/seller/combos" className="btn-back mb-4">
        <ArrowLeft size={16} /> Quay lại danh sách combo
      </Link>

      <div className="card">
        <h1 className="page-title mb-4">
          {isEditing ? 'Chỉnh sửa Combo' : 'Tạo Gói Combo Mới'}
        </h1>

        {submitError != null && (
          <div className="mb-4">
            <ErrorMessage error={submitError} />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Image */}
          <div className="form-group mb-4">
            <label className="form-label">Hình ảnh đại diện combo:</label>
            <div className="flex items-center gap-4">
              <div className="preview-wrap">
                {imageUrl ? (
                  <img src={imageUrl} alt="Combo Preview" className="upload-preview-img" />
                ) : (
                  <div className="upload-placeholder">
                    <Layers size={32} />
                    <span className="text-xs">Chưa có ảnh</span>
                  </div>
                )}
              </div>
              <label className="btn-secondary-sm cursor-pointer">
                <Upload size={14} /> {uploadingImage ? 'Đang tải...' : 'Tải ảnh combo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageFileChange}
                  className="hidden"
                  disabled={uploadingImage}
                />
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tên gói combo *:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Combo Vui Học (1 Trà đào + 1 Bánh mì khô gà)"
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Giá bán combo (VND) *:</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              min={1000}
              step={1000}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả combo:</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ưu đãi của gói combo..."
              className="textarea-field"
            />
          </div>

          {/* Component Items Selector */}
          <div className="combo-items-editor card bg-gray-subtle mt-4 mb-4">
            <div className="flex-between mb-2">
              <h3 className="text-sm font-bold">Thành phần món trong combo (tối thiểu 2 món khác nhau):</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="btn-secondary-xs"
              >
                <Plus size={14} /> Thêm dòng món
              </button>
            </div>

            <div className="combo-item-rows-list">
              {items.map((row, idx) => (
                <div key={idx} className="combo-item-editor-row flex items-center gap-2 mb-2">
                  <select
                    value={row.productId}
                    onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                    className="select-field flex-1"
                    required
                  >
                    <option value="">-- Chọn sản phẩm thành phần --</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Đơn giá: {p.price.toLocaleString('vi-VN')} đ | Tồn: {p.availableStock})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                    min={1}
                    className="input-field w-20 text-center"
                    placeholder="SL"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="btn-text-danger p-2"
                    title="Xóa dòng"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={mutations.createCombo.isPending || mutations.updateCombo.isPending}
            className="btn-primary full-width mt-4"
          >
            {mutations.createCombo.isPending || mutations.updateCombo.isPending
              ? 'Đang lưu combo...'
              : isEditing
              ? 'Cập nhật Combo'
              : 'Tạo gói Combo'}
          </button>
        </form>
      </div>
    </div>
  );
};
