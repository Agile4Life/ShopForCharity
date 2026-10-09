import React, { useState } from "react";
import { FileText } from "lucide-react";
import { useSellerAuditLogs } from "./api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";

export const SellerLogsPage: React.FC = () => {
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, error, refetch } = useSellerAuditLogs({
    action: actionFilter || undefined,
    entityType: entityFilter || undefined,
    date: dateFilter || undefined,
    page,
    size: 20,
  });

  const logs = data?.content || [];

  return (
    <div className="seller-logs-page container">
      <div className="flex-between mb-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText size={24} /> Nhật ký
          </h1>
          <p className="text-muted text-sm">
            Hệ thống ghi nhận bất biến các thao tác nghiệp vụ quan trọng (chỉ
            đọc)
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card mb-4">
        <div className="filter-grid">
          <input
            type="text"
            aria-label="Lọc theo hành động"
            placeholder="Lọc theo hành động (VD: ORDER_CREATED, STOCK_ADJUSTED...)"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="input-field"
          />

          <input
            type="text"
            aria-label="Loại đối tượng"
            placeholder="Loại đối tượng (ORDER, PRODUCT, COMBO...)"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(0);
            }}
            className="input-field"
          />

          <input
            type="date"
            aria-label="Ngày ghi nhật ký"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(0);
            }}
            className="input-field"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Đang tải nhật ký kiểm toán..." />
      ) : error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="Không có bản ghi nhật ký nào"
          description="Chưa có dữ liệu kiểm toán nào khớp với bộ lọc."
        />
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Tác nhân</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Mã Request ID</th>
                  <th>Chi tiết an toàn</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td
                      className="text-xs text-muted whitespace-nowrap"
                      data-label="Thời gian"
                    >
                      {new Date(log.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td data-label="Người thực hiện">
                      <span className="badge badge-gray text-xs">
                        {log.actorType}
                      </span>
                    </td>
                    <td data-label="Hành động">
                      <strong className="text-xs text-primary">
                        {log.action}
                      </strong>
                    </td>
                    <td className="text-xs" data-label="Đối tượng">
                      {log.entityType} (
                      {log.entityId ? log.entityId.substring(0, 8) : "-"})
                    </td>
                    <td
                      className="text-xs text-muted font-mono"
                      data-label="Mã hỗ trợ"
                    >
                      {log.requestId ? log.requestId.substring(0, 8) : "-"}
                    </td>
                    <td className="text-xs" data-label="Chi tiết">
                      {log.safeAfter && (
                        <code className="text-xs bg-gray-100 p-1 rounded block max-w-xs truncate">
                          {log.safeAfter}
                        </code>
                      )}
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
    </div>
  );
};
