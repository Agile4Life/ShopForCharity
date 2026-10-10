import crypto from 'node:crypto';
import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { normalizePhone } from './phone.js';
import { config } from '../config.js';
import { isRegisteredSeller } from './seller-registration.js';

export class ProfileService {
  async actor(jwt) {
    if (!jwt) {
      throw new ApiException(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.');
    }
    const sub = jwt.sub;
    if (!sub) {
      throw new ApiException(401, 'INVALID_TOKEN', 'Token không hợp lệ.');
    }

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const res = await client.query(
        'SELECT * FROM shop.profiles WHERE auth_user_id = $1',
        [sub]
      );

      let profile;
      if (res.rows.length === 0) {
        const id = crypto.randomUUID();
        const email = jwt.email || null;
        const registeredSeller = isRegisteredSeller(jwt);
        const name = registeredSeller && typeof jwt.user_metadata?.full_name === 'string'
          ? jwt.user_metadata.full_name.trim().slice(0, 100) : null;
        const insertRes = await client.query(
          `INSERT INTO shop.profiles (id, auth_user_id, email, role, full_name, active, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, 0, NOW(), NOW())
           RETURNING *`,
          [id, sub, email, registeredSeller ? 'SELLER' : 'CUSTOMER', name]
        );
        profile = insertRes.rows[0];
      } else {
        profile = res.rows[0];
      }

      ApiException.check(
        profile.active,
        403,
        'ACCOUNT_DISABLED',
        'Tài khoản đã bị vô hiệu hóa.'
      );

      return {
        id: profile.id,
        type: profile.role,
        scope: `account:${profile.id}`,
        guestOrderId: null,
      };
    });
  }

  seller(actor) {
    ApiException.check(
      actor != null && actor.type === 'SELLER',
      403,
      'SELLER_REQUIRED',
      'Chỉ người bán được phép thực hiện.'
    );
  }

  async get(actor) {
    const res = await query('SELECT * FROM shop.profiles WHERE id = $1', [actor.id]);
    if (res.rows.length === 0) throw ApiException.missing();
    return this.view(res.rows[0]);
  }

  async patch(actor, input) {
    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const res = await client.query(
        'SELECT * FROM shop.profiles WHERE id = $1',
        [actor.id]
      );
      if (res.rows.length === 0) throw ApiException.missing();
      const p = res.rows[0];

      ApiException.check(
        input.expectedVersion !== undefined && input.expectedVersion !== null,
        400,
        'VERSION_REQUIRED',
        'Cần expectedVersion.'
      );
      ApiException.version(p.version, input.expectedVersion);

      let fullName = p.full_name;
      if (input.fullName !== undefined) {
        fullName = input.fullName ? input.fullName.trim() : null;
        if (fullName !== null && (fullName.length < 2 || fullName.length > 100)) {
          throw new ApiException(
            400,
            'VALIDATION_ERROR',
            'Họ tên phải từ 2 đến 100 ký tự.'
          );
        }
      }

      let phone = p.phone;
      if (input.phone !== undefined) {
        phone = input.phone ? normalizePhone(input.phone) : null;
      }

      const updateRes = await client.query(
        `UPDATE shop.profiles
         SET full_name = $1, phone = $2, version = version + 1, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [fullName, phone, actor.id]
      );

      return this.view(updateRes.rows[0]);
    });
  }

  view(p) {
    return {
      id: p.id,
      fullName: p.full_name,
      phone: p.phone,
      email: p.email,
      role: p.role,
      active: p.active,
      authUserId: p.auth_user_id,
      version: Number(p.version),
    };
  }
}

let defaultProfileService = null;
export function getProfileService() {
  if (!defaultProfileService) {
    defaultProfileService = new ProfileService();
  }
  return defaultProfileService;
}
