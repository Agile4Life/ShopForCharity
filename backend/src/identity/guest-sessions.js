import crypto from 'node:crypto';
import { ApiException } from '../common/api-exception.js';
import { getCrypto } from './crypto.js';

export class GuestSessions {
  constructor(cryptoInstance = getCrypto()) {
    this.crypto = cryptoInstance;
  }

  checkout() {
    const id = crypto.randomUUID();
    const exp = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60; // 2 days
    return this.crypto.sign(`checkout|${id}|${exp}`);
  }

  order(orderId) {
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
    return this.crypto.sign(`order|${orderId}|${exp}`);
  }

  checkoutActor(cookie) {
    return this.parse(cookie, 'checkout');
  }

  orderActor(cookie) {
    return this.parse(cookie, 'order');
  }

  parse(cookie, kind) {
    if (!cookie) {
      throw new ApiException(401, 'SESSION_REQUIRED', 'Cần phiên truy cập.');
    }
    try {
      const payload = this.crypto.verify(cookie);
      const parts = payload.split('|');
      if (parts.length !== 3 || parts[0] !== kind) {
        throw new ApiException(401, 'INVALID_SESSION', 'Phiên truy cập không hợp lệ.');
      }
      const exp = parseInt(parts[2], 10);
      const now = Math.floor(Date.now() / 1000);
      if (Number.isNaN(exp) || exp <= now) {
        throw new ApiException(401, 'SESSION_EXPIRED', 'Phiên đã hết hạn.');
      }
      const id = parts[1];
      return {
        id: null,
        type: 'GUEST',
        scope: `guest:${kind}:${id}`,
        guestOrderId: kind === 'order' ? id : null,
      };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throw new ApiException(401, 'INVALID_SESSION', 'Phiên truy cập không hợp lệ.');
    }
  }
}

let defaultGuestSessions = null;
export function getGuestSessions() {
  if (!defaultGuestSessions) {
    defaultGuestSessions = new GuestSessions();
  }
  return defaultGuestSessions;
}
