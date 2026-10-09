import { PasswordField } from "../../components/Usability";
import { AuthCompanion } from "../../components/PageExperience";
import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "./auth-context";
import { ErrorMessage } from "../../components/ErrorMessage";

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg("Vui lòng điền đầy đủ email và mật khẩu");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await login(email.trim(), password);
      if (res.success) {
        navigate(from, { replace: true });
      } else {
        setErrorMsg(res.error || "Email hoặc mật khẩu không chính xác");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Đăng nhập không thành công");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page container">
      <AuthCompanion />
      <div className="auth-card card max-w-md mx-auto">
        <div className="auth-header text-center">
          <LogIn size={36} className="text-primary mb-2" />
          <h1 className="auth-title">Đăng nhập</h1>
        </div>

        {errorMsg && (
          <div className="mb-4">
            <ErrorMessage error={new Error(errorMsg)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form mt-4">
          <div className="form-group">
            <label htmlFor="loginEmail" className="form-label">
              Địa chỉ Email *
            </label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="email"
              placeholder="ban@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <div className="flex-between">
              <label htmlFor="loginPass" className="form-label">
                Mật khẩu *
              </label>
              <Link to="/forgot-password" className="text-xs text-primary">
                Quên mật khẩu?
              </Link>
            </div>
            <PasswordField
              id="loginPass"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary full-width mt-4"
          >
            {loading ? "Đang xác thực..." : "Đăng nhập"}
          </button>
        </form>

        <div className="auth-footer text-center mt-4 text-sm text-muted">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="text-primary font-bold">
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </div>
  );
};
