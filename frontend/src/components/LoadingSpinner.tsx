import React from "react";

export const LoadingSpinner: React.FC<{
  message?: string;
  className?: string;
}> = ({ message = "Đang tải dữ liệu...", className = "" }) => {
  return (
    <div
      className={`loading-container ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};
