import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { ApiError } from "../lib/api-client";

interface ErrorMessageProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onRetry,
  className = "",
}) => {
  let message = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
  let code: string | undefined;
  let requestId: string | undefined;

  if (error instanceof ApiError) {
    message = error.message;
    code = error.code;
    requestId = error.requestId;
  } else if (error instanceof Error) {
    message = /Failed to fetch|NetworkError|Load failed/i.test(error.message) ? "Không thể kết nối. Kiểm tra mạng và thử lại." : error.message;
  }

  return (
    <div className={`error-box ${className}`} role="alert">
      <div className="error-header">
        <AlertCircle className="error-icon" size={20} />
        <span className="error-title">Chưa thể hoàn tất</span>
      </div>
      <p className="error-description">{message}</p>
      {(code || requestId) && (
        <details className="error-meta">
          <summary>Thông tin hỗ trợ</summary>
          {code && <p>Mã lỗi: {code}</p>}
          {requestId && <p>Mã yêu cầu: {requestId}</p>}
        </details>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="retry-btn">
          <RefreshCw size={16} /> Thử lại
        </button>
      )}
    </div>
  );
};
