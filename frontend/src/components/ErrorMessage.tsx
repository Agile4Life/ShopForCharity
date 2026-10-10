import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { userErrorMessage } from "../lib/user-errors";

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
  const message = userErrorMessage(error);

  return (
    <div className={`error-box ${className}`} role="alert">
      <div className="error-header">
        <AlertCircle className="error-icon" size={20} />
        <span className="error-title">Chưa thể hoàn tất</span>
      </div>
      <p className="error-description">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="retry-btn">
          <RefreshCw size={16} /> Thử lại
        </button>
      )}
    </div>
  );
};
