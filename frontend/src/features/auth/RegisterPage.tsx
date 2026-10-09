import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from './auth-context';
import { ErrorMessage } from '../../components/ErrorMessage';

export const RegisterPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) {
      setErrorMsg('Vui lòng điền đầy đủ các trường thông tin');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Mật khẩu tối thiểu 6 ký tự');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await register(email.trim(), password, fullName.trim(), phone.trim());
      if (res.success) {
        setSuccessMsg(
          'Đăng ký tài khoản thành công! Vui lòng kiểm tra email để xác minh tài khoản nếu được yêu cầu.'
        );
        setTimeout(() => {
          navigate('/');
        }, 2000);
      } else {
        setErrorMsg(res.error || 'Đăng ký không thành công');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã xảy ra lỗi khi đăng ký');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page container">
      <div className="auth-card card max-w-md mx-auto">
        <div className="auth-header text-center">
          <UserPlus size={36} className="text-primary mb-2" />
          <h1 className="auth-title">Đăng ký tài khoản khách hàng</h1>
          <p className="auth-subtitle text-muted text-sm">
            Tạo tài khoản để quản lý đơn hàng dễ dàng hơn
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4">
            <ErrorMessage error={new Error(errorMsg)} />
          </div>
        )}

        {successMsg && (
          <div className="alert-box alert-success mb-4 text-sm">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form mt-4">
          <div className="form-group">
            <label htmlFor="regName" className="form-label">
              Họ và tên *
            </label>
            <input
              id="regName"
              type="text"
              placeholder="Nguyễn Văn A"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="regPhone" className="form-label">
              Số điện thoại *
            </label>
            <input
              id="regPhone"
              type="tel"
              placeholder="0912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="regEmail" className="form-label">
              Địa chỉ Email *
            </label>
            <input
              id="regEmail"
              type="email"
              placeholder="hocsinh@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="regPass" className="form-label">
              Mật khẩu * (Tối thiểu 6 ký tự)
            </label>
            <input
              id="regPass"
              type="password"
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
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký ngay'}
          </button>
        </form>

        <div className="auth-footer text-center mt-4 text-sm text-muted">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-primary font-bold">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};
