import React, { useState } from "react";
import { User, Shield } from "lucide-react";
import { useAuth } from "./auth-context";
import { apiFetch } from "../../lib/api-client";
import { ErrorMessage } from "../../components/ErrorMessage";

export const ProfilePage: React.FC = () => {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      await apiFetch("/me", {
        method: "PATCH",
        body: { fullName, phone, expectedVersion: profile?.version ?? 0 },
      });
      await refreshProfile();
      setMessage("Đã lưu thông tin.");
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi cập nhật hồ sơ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page container max-w-lg mx-auto">
      <div className="card">
        <div className="profile-header flex items-center gap-3 mb-4">
          <div className="profile-avatar">
            <User size={32} />
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {profile?.fullName || "Người dùng"}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge badge-blue flex items-center gap-1">
                <Shield size={12} />{" "}
                {profile?.role === "SELLER" ? "Người bán" : "Khách hàng"}
              </span>
            </div>
          </div>
        </div>

        {message && (
          <div className="alert-box alert-success mb-4 text-sm" role="status">
            {message}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4">
            <ErrorMessage error={new Error(errorMsg)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="profile-form">
          <div className="form-group">
            <label htmlFor="profName" className="form-label">
              Họ và tên
            </label>
            <input
              id="profName"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="profPhone" className="form-label">
              Số điện thoại
            </label>
            <input
              id="profPhone"
              autoComplete="tel"
              inputMode="tel"
              pattern="(0|\+84)[35789][0-9]{8}"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="profEmail" className="form-label">
              Địa chỉ Email
            </label>
            <input
              id="profEmail"
              type="email"
              value={profile?.email || ""}
              disabled
              className="input-field input-disabled"
            />
            <span className="text-xs text-muted">Email đăng nhập</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary full-width mt-4"
          >
            {loading ? "Đang lưu..." : "Lưu thông tin"}
          </button>
        </form>
      </div>
    </div>
  );
};
