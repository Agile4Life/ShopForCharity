import { LoadingSpinner } from "./components/LoadingSpinner";
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { AuthProvider } from "./features/auth/auth-context";
import { CartProvider } from "./features/cart/cart-context";

import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import {
  AccountNavigation,
  FeedbackNotice,
  MobileNavigation,
  RouteContentBoundary,
} from "./components/Usability";
import {
  PageExperience,
  RouteCompanion,
  NotFoundPage,
} from "./components/PageExperience";
import { ProtectedRoute, SellerRoute } from "./routes/guards";

// Public & Catalog Pages
import { LandingPage } from "./features/catalog/LandingPage";
const ProductDetailPage = React.lazy(() =>
  import("./features/catalog/ProductDetailPage").then((module) => ({
    default: module.ProductDetailPage,
  })),
);
const ComboDetailPage = React.lazy(() =>
  import("./features/catalog/ComboDetailPage").then((module) => ({
    default: module.ComboDetailPage,
  })),
);

// Cart & Checkout
const CartPage = React.lazy(() =>
  import("./features/cart/CartPage").then((module) => ({
    default: module.CartPage,
  })),
);
const CheckoutPage = React.lazy(() =>
  import("./features/checkout/CheckoutPage").then((module) => ({
    default: module.CheckoutPage,
  })),
);
const OrderSuccessPage = React.lazy(() =>
  import("./features/checkout/OrderSuccessPage").then((module) => ({
    default: module.OrderSuccessPage,
  })),
);

// Orders Tracking
const GuestOrderLookupPage = React.lazy(() =>
  import("./features/orders/GuestOrderLookupPage").then((module) => ({
    default: module.GuestOrderLookupPage,
  })),
);
const CustomerOrdersPage = React.lazy(() =>
  import("./features/orders/CustomerOrdersPage").then((module) => ({
    default: module.CustomerOrdersPage,
  })),
);
const CustomerOrderDetailPage = React.lazy(() =>
  import("./features/orders/CustomerOrderDetailPage").then((module) => ({
    default: module.CustomerOrderDetailPage,
  })),
);

// Auth Pages
const LoginPage = React.lazy(() =>
  import("./features/auth/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = React.lazy(() =>
  import("./features/auth/RegisterPage").then((module) => ({
    default: module.RegisterPage,
  })),
);
const ForgotPasswordPage = React.lazy(() =>
  import("./features/auth/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = React.lazy(() =>
  import("./features/auth/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const AuthCallbackPage = React.lazy(() =>
  import("./features/auth/AuthCallbackPage").then((module) => ({
    default: module.AuthCallbackPage,
  })),
);
const ProfilePage = React.lazy(() =>
  import("./features/auth/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);

// Seller Management Pages
const SellerDashboardPage = React.lazy(() =>
  import("./features/seller/SellerDashboardPage").then((module) => ({
    default: module.SellerDashboardPage,
  })),
);
const SellerOrdersPage = React.lazy(() =>
  import("./features/seller/SellerOrdersPage").then((module) => ({
    default: module.SellerOrdersPage,
  })),
);
const SellerOrderDetailPage = React.lazy(() =>
  import("./features/seller/SellerOrderDetailPage").then((module) => ({
    default: module.SellerOrderDetailPage,
  })),
);
const SellerProductsPage = React.lazy(() =>
  import("./features/seller/SellerProductsPage").then((module) => ({
    default: module.SellerProductsPage,
  })),
);
const SellerProductEditPage = React.lazy(() =>
  import("./features/seller/SellerProductEditPage").then((module) => ({
    default: module.SellerProductEditPage,
  })),
);
const SellerCombosPage = React.lazy(() =>
  import("./features/seller/SellerCombosPage").then((module) => ({
    default: module.SellerCombosPage,
  })),
);
const SellerComboEditPage = React.lazy(() =>
  import("./features/seller/SellerComboEditPage").then((module) => ({
    default: module.SellerComboEditPage,
  })),
);
const SellerSettingsPage = React.lazy(() =>
  import("./features/seller/SellerSettingsPage").then((module) => ({
    default: module.SellerSettingsPage,
  })),
);
const SellerLogsPage = React.lazy(() =>
  import("./features/seller/SellerLogsPage").then((module) => ({
    default: module.SellerLogsPage,
  })),
);

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <PageExperience />
            <div className="app-shell">
              <Navbar />
              <RouteCompanion />
              <AccountNavigation />
              <main className="main-content" id="main-content" tabIndex={-1}>
                <RouteContentBoundary>
                  <React.Suspense
                    fallback={<LoadingSpinner message="Đang mở trang…" />}
                  >
                    <Routes>
                      {/* Public Catalog */}
                      <Route path="/" element={<LandingPage />} />
                      <Route
                        path="/products/:slug"
                        element={<ProductDetailPage />}
                      />
                      <Route
                        path="/combos/:slug"
                        element={<ComboDetailPage />}
                      />

                      {/* Cart & Checkout */}
                      <Route path="/cart" element={<CartPage />} />
                      <Route path="/checkout" element={<CheckoutPage />} />
                      <Route
                        path="/order-success"
                        element={<OrderSuccessPage />}
                      />
                      <Route
                        path="/guest-order"
                        element={<GuestOrderLookupPage />}
                      />

                      {/* Auth */}
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      <Route
                        path="/forgot-password"
                        element={<ForgotPasswordPage />}
                      />
                      <Route
                        path="/reset-password"
                        element={<ResetPasswordPage />}
                      />
                      <Route
                        path="/auth/callback"
                        element={<AuthCallbackPage />}
                      />

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
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </React.Suspense>
                </RouteContentBoundary>
              </main>
              <Footer />
              <MobileNavigation />
              <FeedbackNotice />
            </div>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
