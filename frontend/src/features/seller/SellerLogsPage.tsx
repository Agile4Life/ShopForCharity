import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useSellerAuditLogs } from "./api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { EmptyState } from "../../components/EmptyState";
import { DatePicker } from "../../components/DatePicker";
import { AUDIT_ACTION_LABELS, AUDIT_ACTOR_LABELS, AUDIT_ENTITY_LABELS, formatAuditDetails } from "./audit-display";
import { ConfirmedOrderHistory } from "./ConfirmedOrderHistory";

export const SellerLogsPage: React.FC = () => {
  const [view, setView] = useState<"all" | "confirmed">("all");
  return <div className="seller-logs-page container">
    <div className="flex-between mb-4"><div>
      <h1 className="page-title flex items-center gap-2"><FileText size={24} /> Nhật ký</h1>
      <p className="text-muted text-sm">Xem lịch sử đơn hàng, tồn kho và thiết lập cửa hàng.</p>
    </div></div>
    <nav className="seller-log-views" aria-label="Mục nhật ký">
      <button type="button" aria-pressed={view === "all"} className={view === "all" ? "btn-primary-sm" : "btn-secondary-sm"}
        onClick={() => setView("all")}>Tất cả hoạt động</button>
      <button type="button" aria-pressed={view === "confirmed"} className={view === "confirmed" ? "btn-primary-sm" : "btn-secondary-sm"}
        onClick={() => setView("confirmed")}>Đơn đã xác nhận</button>
    </nav>
    {view === "all" ? <AuditLogHistory /> : <ConfirmedOrderHistory />}
  </div>;
};

function AuditLogHistory() {
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
    <section aria-label="Tất cả hoạt động">
      {/* Filter toolbar */}
      <div className="card mb-4">
        <div className="filter-grid">
          <select
            aria-label="Lọc theo hành động"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="input-field"
          >
            <option value="">Tất cả hành động</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            aria-label="Loại đối tượng"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(0);
            }}
            className="input-field"
          >
            <option value="">Tất cả đối tượng</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <DatePicker
            label="Ngày ghi nhật ký"
            placeholder="Tất cả ngày"
            value={dateFilter}
            onChange={(value) => {
              setDateFilter(value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Đang tải nhật ký kiểm toán..." />
      ) : error && !data ? (
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
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Mã hỗ trợ</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td
                      className="text-xs text-muted whitespace-nowrap"
                      data-label="Thời gian"
                    >
                      <time dateTime={log.createdAt}>
                        {new Date(log.createdAt).toLocaleString("vi-VN")}
                      </time>
                    </td>
                    <td data-label="Người thực hiện">
                      <span className="badge badge-gray text-xs">
                        {AUDIT_ACTOR_LABELS[log.actorType] ?? "Người thực hiện khác"}
                      </span>
                    </td>
                    <td data-label="Hành động">
                      <strong className="text-xs text-primary">
                        {AUDIT_ACTION_LABELS[log.action] ?? "Hoạt động khác"}
                      </strong>
                    </td>
                    <td className="text-xs" data-label="Đối tượng">
                      {log.entityId && ["ORDER", "PRODUCT"].includes(log.entityType) ? (
                        <Link to={log.entityType === "ORDER" ? `/seller/orders/${log.entityId}`
                          : `/seller/products/${log.entityId}/edit`}>
                          Xem {AUDIT_ENTITY_LABELS[log.entityType].toLocaleLowerCase("vi-VN")}
                        </Link>
                      ) : <span>{AUDIT_ENTITY_LABELS[log.entityType] ?? "Đối tượng khác"}</span>}
                    </td>
                    <td
                      className="text-xs text-muted font-mono"
                      data-label="Mã hỗ trợ"
                    >
                      {log.requestId ? <details className="support-code-details"><summary>Xem mã</summary>
                        <span className="support-code-value">{log.requestId}</span>
                      </details> : "—"}
                    </td>
                    <td className="text-xs" data-label="Chi tiết">
                      <span className="audit-details">{formatAuditDetails(log.safeAfter)}</span>
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
    </section>
  );
}
