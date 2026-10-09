import { AuthCompanion } from "../../components/PageExperience";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, ArrowLeft } from "lucide-react";
import { useAuth } from "./auth-context";
import { ErrorMessage } from "../../components/ErrorMessage";

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await resetPassword(email.trim());
      if (res.success) {
        setSent(true);
      } else {
        setErrorMsg(res.error || "Gửi yêu cầu không thành công");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi gửi yêu cầu khôi phục mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page container">
      <AuthCompanion />
      <div className="auth-card card max-w-md mx-auto">
        <Link to="/login" className="btn-back mb-3">
          <ArrowLeft size={16} /> Quay lại đăng nhập
        </Link>

        <div className="auth-header text-center">
          <KeyRound size={36} className="text-primary mb-2" />
          <h1 className="auth-title">Quên mật khẩu</h1>
          <p className="auth-subtitle text-muted text-sm">
            Nhập email để nhận liên kết đặt lại mật khẩu.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4">
            <ErrorMessage error={new Error(errorMsg)} />
          </div>
        )}

        {sent ? (
          <div className="alert-box alert-success my-4 text-sm">
            Đã gửi liên kết khôi phục mật khẩu tới email{" "}
            <strong>{email}</strong>. Vui lòng kiểm tra hòm thư của bạn!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form mt-4">
            <div className="form-group">
              <label htmlFor="forgotEmail" className="form-label">
                Địa chỉ Email *
              </label>
              <input
                id="forgotEmail"
                type="email"
                placeholder="ban@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary full-width mt-4"
            >
              {loading ? "Đang gửi..." : "Gửi liên kết khôi phục"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
