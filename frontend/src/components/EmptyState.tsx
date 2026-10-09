import React from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Không có dữ liệu',
  description = 'Hiện chưa có nội dung nào để hiển thị.',
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div className={`empty-state ${className}`}>
      <PackageOpen size={48} className="empty-icon" />
      <h3 className="empty-title">{title}</h3>
      <p className="empty-description">{description}</p>
      {actionText && onAction && (
        <button type="button" onClick={onAction} className="empty-action-btn">
          {actionText}
        </button>
      )}
    </div>
  );
};
