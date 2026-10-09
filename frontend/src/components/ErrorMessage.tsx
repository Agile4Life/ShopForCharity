import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ApiError } from '../lib/api-client';

interface ErrorMessageProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onRetry, className = '' }) => {
  let message = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
  let code: string | undefined;
  let requestId: string | undefined;

  if (error instanceof ApiError) {
    message = error.message;
    code = error.code;
    requestId = error.requestId;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className={`error-box ${className}`} role="alert">
      <div className="error-header">
        <AlertCircle className="error-icon" size={20} />
        <span className="error-title">Thông báo lỗi {code ? `[${code}]` : ''}</span>
      </div>
      <p className="error-description">{message}</p>
      {requestId && <div className="error-meta">Mã yêu cầu (Request ID): {requestId}</div>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="retry-btn">
          <RefreshCw size={16} /> Thử lại
        </button>
      )}
    </div>
  );
};
