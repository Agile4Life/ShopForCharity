import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, LoaderCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { userErrorMessage } from '../../lib/user-errors';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PasswordField } from '../../components/Usability';
import { AuthCompanion } from '../../components/PageExperience';

export function SellerRegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || success) return;
    setError('');
    if (password !== confirmation) { setError('Mật khẩu xác nhận chưa khớp.'); return; }
    submitting.current = true;
    setLoading(true);
    try {
      await apiFetch('/auth/register-seller', { method: 'POST', skipIdempotency: true, silent: true,
        timeoutMs: 25000, body: { code: code.trim(), email: email.trim(), password, fullName: fullName.trim() },
        validate: data => !!data && typeof data === 'object' && 'success' in data && data.success === true });
      setSuccess(true);
      setPassword(''); setConfirmation(''); setCode('');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      setError(userErrorMessage(
        code === 'WRITE_TIMEOUT' || code === 'WRITE_RESULT_UNKNOWN' ? { code: 'SELLER_REGISTRATION_UNKNOWN' } : error,
        'Chưa tạo được tài khoản người bán. Vui lòng thử lại.',
      ));
    } finally { submitting.current = false; setLoading(false); }
  }

  return <div className="auth-page container">
    <AuthCompanion />
    <section className="auth-card card max-w-md mx-auto" aria-labelledby="seller-register-title">
      <div className="auth-header text-center mb-6">
        <div className="auth-icon"><Store size={32} /></div>
        <h1 id="seller-register-title" className="auth-title">Đăng ký người bán</h1>
        <p className="text-muted text-sm mt-2">Dùng mã được cấp để tham gia quản lý Gói Ấm Cho Em. Các người bán cùng quản lý sản phẩm, kho hàng, đơn hàng và thiết lập của shop.</p>
      </div>
      {error && <div className="mb-4"><ErrorMessage error={new Error(error)} /></div>}
      {success ? <div role="status" className="text-center">
        <p className="text-primary font-bold">Đã tạo tài khoản người bán!</p>
        <p className="text-sm text-muted mt-2">Đăng nhập bằng email {email.trim()} và mật khẩu vừa tạo để quản lý shop.</p>
        <Link to="/login" state={{ from: { pathname: '/seller' } }} className="btn-primary full-width mt-4">Đăng nhập để quản lý shop</Link>
      </div> : <form onSubmit={submit} className="auth-form mt-4" aria-busy={loading}>
        <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-group">
            <label htmlFor="sellerCode" className="form-label">Mã đăng ký người bán *</label>
            <PasswordField id="sellerCode" value={code} onChange={e => setCode(e.target.value)} className="input-field" autoComplete="off" maxLength={200} required />
            <p className="text-xs text-muted mt-2">Nhập mã do shop cung cấp.</p>
          </div>
          <div className="form-group">
            <label htmlFor="sellerName" className="form-label">Họ và tên *</label>
            <input id="sellerName" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field" autoComplete="name" minLength={2} maxLength={100} required />
          </div>
          <div className="form-group">
            <label htmlFor="sellerEmail" className="form-label">Email đăng nhập *</label>
            <input id="sellerEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" autoComplete="email" maxLength={254} required />
          </div>
          <div className="form-group">
            <label htmlFor="sellerPassword" className="form-label">Mật khẩu *</label>
            <PasswordField id="sellerPassword" value={password} onChange={e => setPassword(e.target.value)} className="input-field" autoComplete="new-password" minLength={8} maxLength={128} required />
            <p className="text-xs text-muted mt-2">Ít nhất 8 ký tự.</p>
          </div>
          <div className="form-group">
            <label htmlFor="sellerConfirmation" className="form-label">Nhập lại mật khẩu *</label>
            <PasswordField id="sellerConfirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="input-field" autoComplete="new-password" minLength={8} maxLength={128} required />
          </div>
        </fieldset>
        <button type="submit" disabled={loading} className="btn-primary full-width mt-4">
          {loading && <LoaderCircle size={18} className="network-activity-spinner" aria-hidden="true" />}
          {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản người bán'}
        </button>
        {loading && <p role="status" className="text-sm text-muted mt-2">Đang tạo tài khoản và cấp quyền quản lý shop…</p>}
      </form>}
      <div className="auth-footer text-center mt-4 text-sm text-muted">
        Đã có tài khoản? <Link to="/login" className="text-primary font-bold">Đăng nhập</Link>
        <p className="mt-2"><Link to="/register" className="text-primary">Đăng ký tài khoản mua hàng</Link></p>
      </div>
    </section>
  </div>;
}
