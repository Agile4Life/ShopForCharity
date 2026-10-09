import { PasswordField } from "../../components/Usability";
import { AuthCompanion } from "../../components/PageExperience";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ErrorMessage } from "../../components/ErrorMessage";

export const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Mật khẩu tối thiểu 6 ký tự");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccess(true);
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi đặt lại mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page container">
      <AuthCompanion />
      <div className="auth-card card max-w-md mx-auto">
        <div className="auth-header text-center">
          <Lock size={36} className="text-primary mb-2" />
          <h1 className="auth-title">Đặt lại mật khẩu mới</h1>
        </div>

        {errorMsg && (
          <div className="mb-4">
            <ErrorMessage error={new Error(errorMsg)} />
          </div>
        )}

        {success ? (
          <div className="alert-box alert-success my-4 text-sm">
            Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form mt-4">
            <div className="form-group">
              <label htmlFor="newPass" className="form-label">
                Mật khẩu mới * (Tối thiểu 6 ký tự)
              </label>
              <PasswordField
                id="newPass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPass" className="form-label">
                Xác nhận mật khẩu mới *
              </label>
              <PasswordField
                id="confirmPass"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary full-width mt-4"
            >
              {loading ? "Đang cập nhật..." : "Lưu mật khẩu mới"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
