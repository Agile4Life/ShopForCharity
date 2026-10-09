import React from 'react';

export const LoadingSpinner: React.FC<{ message?: string; className?: string }> = ({
  message = 'Đang tải dữ liệu...',
  className = '',
}) => {
  return (
    <div className={`loading-container ${className}`}>
      <div className="spinner" role="status" aria-label="loading"></div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};
