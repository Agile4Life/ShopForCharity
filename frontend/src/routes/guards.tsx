import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-context';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, profileError, refreshProfile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner message="Đang kiểm tra phiên đăng nhập..." />;
  }

  if (profileError) return <div className="container mt-4"><ErrorMessage error={profileError} onRetry={refreshProfile} /></div>;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const SellerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isSeller, isLoading, profileError, refreshProfile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner message="Đang xác minh quyền quản trị..." />;
  }

  if (profileError) return <div className="container mt-4"><ErrorMessage error={profileError} onRetry={refreshProfile} /></div>;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isSeller) {
    return (
      <div className="unauthorized-page container">
        <h2>Truy cập bị từ chối</h2>
        <p>Tài khoản của bạn không có quyền quản trị người bán (SELLER).</p>
      </div>
    );
  }

  return <>{children}</>;
};
