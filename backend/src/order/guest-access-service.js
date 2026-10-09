import crypto from 'node:crypto';
import { query } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { CryptoService } from '../identity/crypto.js';
import { config } from '../config.js';

export class GuestAccessService {
  async verify(input) {
    if (!input || !input.orderCode || !input.guestToken) {
      throw new ApiException(401, 'INVALID_GUEST_ACCESS', 'Mã đơn hoặc khóa xem đơn không hợp lệ.');
    }

    const res = await query(
      'SELECT * FROM shop.orders WHERE shop_id = $1 AND order_code = $2',
      [config.shopId, input.orderCode]
    );

    const order = res.rows[0];
    const actualHash = order && order.guest_token_hash ? order.guest_token_hash : '0'.repeat(64);
    const tokenHash = CryptoService.hash(input.guestToken);

    const actualBuf = Buffer.from(actualHash, 'ascii');
    const tokenBuf = Buffer.from(tokenHash, 'ascii');

    const match =
      actualBuf.length === tokenBuf.length &&
      crypto.timingSafeEqual(actualBuf, tokenBuf);

    const now = new Date();
    const expiresAt = order && order.guest_token_expires_at ? new Date(order.guest_token_expires_at) : null;

    if (
      !match ||
      !order ||
      order.customer_id != null ||
      !expiresAt ||
      expiresAt <= now
    ) {
      throw new ApiException(401, 'INVALID_GUEST_ACCESS', 'Mã đơn hoặc khóa xem đơn không hợp lệ.');
    }

    return order.id;
  }
}

let defaultGuestAccessService = null;
export function getGuestAccessService() {
  if (!defaultGuestAccessService) {
    defaultGuestAccessService = new GuestAccessService();
  }
  return defaultGuestAccessService;
}
