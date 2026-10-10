import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';

// Only the Admin Auth API can write app_metadata. Never read user_metadata for privileges.
export function isRegisteredSeller(jwt, shopId = config.shopId) {
  return jwt?.app_metadata?.seller_shop_id === shopId;
}

export async function provisionSeller(user, transact = withTx) {
  return transact(async client => {
    await lockShop(client, config.shopId);
    await client.query(
      `INSERT INTO shop.profiles (id, auth_user_id, email, full_name, role, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SELLER', true, 0, NOW(), NOW())
       ON CONFLICT (auth_user_id) DO NOTHING`,
      [randomUUID(), user.id, user.email, user.user_metadata?.full_name || null],
    );
    const result = await client.query('SELECT role, active FROM shop.profiles WHERE auth_user_id = $1', [user.id]);
    ApiException.check(result.rows[0]?.role === 'SELLER' && result.rows[0]?.active,
      409, 'SELLER_PROFILE_CONFLICT', 'Không thể cấp quyền người bán cho tài khoản này.');
  });
}

export class SellerRegistration {
  constructor({ settings = config, fetcher = fetch, provision = provisionSeller } = {}) {
    this.settings = settings;
    this.fetcher = fetcher;
    this.provision = provision;
  }

  async register(input) {
    const { settings } = this;
    ApiException.check(settings.sellerRegistrationCode && settings.supabaseUrl && settings.supabaseStorageKey,
      503, 'SELLER_REGISTRATION_UNAVAILABLE', 'Đăng ký người bán chưa khả dụng.');
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    const digest = value => createHash('sha256').update(value).digest();
    ApiException.check(code.length <= 200 && timingSafeEqual(digest(code), digest(settings.sellerRegistrationCode)),
      403, 'INVALID_SELLER_CODE', 'Mã đăng ký người bán chưa đúng.');
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    ApiException.check(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      && password.length >= 8 && password.length <= 128 && fullName.length >= 2 && fullName.length <= 100,
      400, 'SELLER_REGISTRATION_INPUT', 'Kiểm tra email, họ tên và mật khẩu.');

    let response;
    let user;
    try {
      response = await this.fetcher(`${settings.supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: settings.supabaseStorageKey, Authorization: `Bearer ${settings.supabaseStorageKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true,
          user_metadata: { full_name: fullName }, app_metadata: { seller_shop_id: settings.shopId } }),
        signal: AbortSignal.timeout(12000),
      });
      user = await response.json();
    } catch {
      // The provider may have committed before the connection was interrupted.
      throw new ApiException(503, 'SELLER_REGISTRATION_UNKNOWN', 'Chưa xác nhận được kết quả tạo tài khoản.');
    }
    if (!response.ok) {
      const code = user.code || user.error_code;
      if (['email_exists', 'user_already_exists'].includes(code))
        throw new ApiException(409, 'SELLER_EMAIL_EXISTS', 'Email đã được sử dụng.');
      if (code === 'weak_password') throw new ApiException(400, 'weak_password', 'Mật khẩu chưa đủ mạnh.');
      if (response.status === 429) throw new ApiException(429, 'RATE_LIMITED', 'Vui lòng thử lại sau.');
      throw new ApiException(503, 'SELLER_REGISTRATION_UNAVAILABLE', 'Chưa tạo được tài khoản người bán.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id || '') || user.email?.toLowerCase() !== email
      || !isRegisteredSeller(user, settings.shopId))
      throw new ApiException(503, 'SELLER_REGISTRATION_UNKNOWN', 'Chưa xác nhận được kết quả tạo tài khoản.');
    try { await this.provision(user); }
    catch {
      // A later authenticated request repairs the missing profile from trusted app_metadata.
      throw new ApiException(503, 'SELLER_PROFILE_PENDING', 'Tài khoản đã tạo nhưng quyền quản lý chưa sẵn sàng.');
    }
    return { success: true };
  }
}

const registration = new SellerRegistration();
export const sellerRegistrationRouter = Router();
sellerRegistrationRouter.post('/auth/register-seller', async (req, res, next) => {
  try { res.status(201).json(await registration.register(req.body || {})); }
  catch (error) { next(error); }
});
