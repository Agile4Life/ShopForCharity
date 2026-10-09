import { query } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { config } from '../config.js';

export class OrderAccess {
  async owned(id, actor, seller, client = null) {
    const res = await query(
      'SELECT * FROM shop.orders WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) throw ApiException.missing();
    const o = res.rows[0];
    if (o.shop_id !== config.shopId) throw ApiException.missing();
    this.authorize(o, actor, seller);
    return o;
  }

  async code(orderCode, actor, client = null) {
    const res = await query(
      'SELECT * FROM shop.orders WHERE shop_id = $1 AND order_code = $2',
      [config.shopId, orderCode],
      client
    );
    if (res.rows.length === 0) throw ApiException.missing();
    const o = res.rows[0];
    this.authorize(o, actor, false);
    return o;
  }

  authorize(order, actor, seller) {
    if (seller && actor && actor.type === 'SELLER') return;
    if (actor && actor.id != null && actor.id === order.customer_id) return;
    if (
      actor &&
      actor.id == null &&
      order.customer_id == null &&
      order.id === actor.guestOrderId
    ) {
      return;
    }
    throw ApiException.missing();
  }
}

let defaultOrderAccess = null;
export function getOrderAccess() {
  if (!defaultOrderAccess) {
    defaultOrderAccess = new OrderAccess();
  }
  return defaultOrderAccess;
}
