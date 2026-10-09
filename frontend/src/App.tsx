import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { AuthProvider } from './features/auth/auth-context';
import { CartProvider } from './features/cart/cart-context';

import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ProtectedRoute, SellerRoute } from './routes/guards';

// Public & Catalog Pages
import { LandingPage } from './features/catalog/LandingPage';
import { ProductDetailPage } from './features/catalog/ProductDetailPage';
import { ComboDetailPage } from './features/catalog/ComboDetailPage';

// Cart & Checkout
import { CartPage } from './features/cart/CartPage';
import { CheckoutPage } from './features/checkout/CheckoutPage';
import { OrderSuccessPage } from './features/checkout/OrderSuccessPage';

// Orders Tracking
import { GuestOrderLookupPage } from './features/orders/GuestOrderLookupPage';
import { CustomerOrdersPage } from './features/orders/CustomerOrdersPage';
import { CustomerOrderDetailPage } from './features/orders/CustomerOrderDetailPage';

// Auth Pages
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { ProfilePage } from './features/auth/ProfilePage';

// Seller Management Pages
import { SellerDashboardPage } from './features/seller/SellerDashboardPage';
import { SellerOrdersPage } from './features/seller/SellerOrdersPage';
import { SellerOrderDetailPage } from './features/seller/SellerOrderDetailPage';
import { SellerProductsPage } from './features/seller/SellerProductsPage';
import { SellerProductEditPage } from './features/seller/SellerProductEditPage';
import { SellerCombosPage } from './features/seller/SellerCombosPage';
import { SellerComboEditPage } from './features/seller/SellerComboEditPage';
import { SellerSettingsPage } from './features/seller/SellerSettingsPage';
import { SellerLogsPage } from './features/seller/SellerLogsPage';

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <div className="app-shell">
              <Navbar />
              <main className="main-content">
                <Routes>
                  {/* Public Catalog */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/products/:slug" element={<ProductDetailPage />} />
                  <Route path="/combos/:slug" element={<ComboDetailPage />} />

                  {/* Cart & Checkout */}
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/order-success" element={<OrderSuccessPage />} />
                  <Route path="/guest-order" element={<GuestOrderLookupPage />} />

                  {/* Auth */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/auth/callback" element={<AuthCallbackPage />} />

                  {/* Customer Account (Protected) */}
                  <Route
                    path="/account/orders"
                    element={
                      <ProtectedRoute>
                        <CustomerOrdersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/account/orders/:orderId"
                    element={
                      <ProtectedRoute>
                        <CustomerOrderDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/account/profile"
                    element={
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Seller Management (SellerRoute) */}
                  <Route
                    path="/seller"
                    element={
                      <SellerRoute>
                        <SellerDashboardPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/orders"
                    element={
                      <SellerRoute>
                        <SellerOrdersPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/orders/:orderId"
                    element={
                      <SellerRoute>
                        <SellerOrderDetailPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/products"
                    element={
                      <SellerRoute>
                        <SellerProductsPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/products/new"
                    element={
                      <SellerRoute>
                        <SellerProductEditPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/products/:id/edit"
                    element={
                      <SellerRoute>
                        <SellerProductEditPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/combos"
                    element={
                      <SellerRoute>
                        <SellerCombosPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/combos/new"
                    element={
                      <SellerRoute>
                        <SellerComboEditPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/combos/:id/edit"
                    element={
                      <SellerRoute>
                        <SellerComboEditPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/settings"
                    element={
                      <SellerRoute>
                        <SellerSettingsPage />
                      </SellerRoute>
                    }
                  />
                  <Route
                    path="/seller/logs"
                    element={
                      <SellerRoute>
                        <SellerLogsPage />
                      </SellerRoute>
                    }
                  />

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
