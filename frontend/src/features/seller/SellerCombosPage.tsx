import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, Plus, Edit, Archive, CheckCircle } from 'lucide-react';
import { useSellerCombos, useSellerComboMutations } from './api';
import { ProductStatusBadge } from '../../components/StatusBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';

export const SellerCombosPage: React.FC = () => {
  const { data: combos = [], isLoading, error, refetch } = useSellerCombos();
  const mutations = useSellerComboMutations();

  return (
    <div className="seller-combos-page container">
      <div className="flex-between mb-4">
        <div>
          <h1 className="page-title">
            <Layers size={24} /> Quản lý Gói Combo
          </h1>
          <p className="text-muted text-sm">
            Tạo các combo gồm nhiều món ăn vặt & quà lưu niệm để kích cầu mua sắm
          </p>
        </div>
        <Link to="/seller/combos/new" className="btn-primary">
          <Plus size={16} /> Tạo Combo mới
        </Link>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Đang tải danh sách combo..." />
      ) : error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : combos.length === 0 ? (
        <div className="card text-center py-6">
          <p className="text-muted mb-3">Hiện chưa có gói combo nào được tạo.</p>
          <Link to="/seller/combos/new" className="btn-primary-sm">
            <Plus size={14} /> Tạo gói combo đầu tiên
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="combos-table">
              <thead>
                <tr>
                  <th>Tên Combo</th>
                  <th>Thành phần món</th>
                  <th className="text-right">Giá Combo</th>
                  <th className="text-center">Tồn khả dụng</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.name} className="table-thumb" />
                        ) : (
                          <div className="table-thumb-placeholder">Combo</div>
                        )}
                        <div>
                          <strong>{c.name}</strong>
                          <span className="block text-xs text-muted">{c.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ul className="text-xs list-disc pl-4">
                        {c.items.map((i) => (
                          <li key={i.productId}>
                            {i.productName} (x{i.quantity})
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="text-right font-medium">
                      {c.price.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="text-center">
                      <span className={c.availableStock > 0 ? 'text-green font-bold' : 'text-red font-bold'}>
                        {c.availableStock}
                      </span>
                    </td>
                    <td>
                      <ProductStatusBadge status={c.status} />
                    </td>
                    <td className="text-right">
                      <div className="action-buttons-group">
                        <Link
                          to={`/seller/combos/${c.id}/edit`}
                          className="btn-secondary-xs"
                          title="Sửa combo"
                        >
                          <Edit size={14} /> Sửa
                        </Link>

                        {c.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => mutations.archiveCombo.mutate(c.id)}
                            className="btn-danger-xs"
                            title="Ẩn combo"
                          >
                            <Archive size={14} /> Ẩn
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => mutations.activateCombo.mutate(c.id)}
                            className="btn-primary-xs"
                            title="Mở bán combo"
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
        </div>
      )}
    </div>
  );
};
