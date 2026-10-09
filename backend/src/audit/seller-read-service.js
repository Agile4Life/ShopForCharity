import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { size, toNumber, toIso } from '../common/views.js';
import { config } from '../config.js';
import { getProfileService } from '../identity/profile-service.js';

export class SellerReadService {
  constructor(profileServiceInstance = getProfileService()) {
    this.profiles = profileServiceInstance;
  }

  async dashboard(actor) {
    this.profiles.seller(actor);

    const completedRes = await query(
      `SELECT coalesce(sum(total), 0) AS val FROM shop.orders
       WHERE shop_id = $1 AND payment_status = 'PAID' AND status = 'COMPLETED'`,
      [config.shopId]
    );

    const pendingRes = await query(
      `SELECT coalesce(sum(received_amount), 0) AS val FROM shop.orders
       WHERE shop_id = $1 AND status IN ('PENDING_CONTACT', 'ACCEPTED', 'PREPARING', 'READY')`,
      [config.shopId]
    );

    const pendingCountRes = await query(
      `SELECT count(*) FROM shop.orders
       WHERE shop_id = $1 AND status = 'PENDING_CONTACT'`,
      [config.shopId]
    );

    const readyCountRes = await query(
      `SELECT count(*) FROM shop.orders
       WHERE shop_id = $1 AND status = 'READY'`,
      [config.shopId]
    );

    return {
      pendingCount: parseInt(pendingCountRes.rows[0].count, 10),
      readyCount: parseInt(readyCountRes.rows[0].count, 10),
      completedRevenue: toNumber(completedRes.rows[0].val),
      pendingRevenue: toNumber(pendingRes.rows[0].val),
    };
  }

  async notifications(actor, page, requestedSize) {
    this.profiles.seller(actor);
    ApiException.check(page >= 0 && page <= 100000, 400, 'INVALID_PAGE', 'Trang không hợp lệ.');

    const pageSize = size(requestedSize);
    const countRes = await query(
      'SELECT count(*) FROM shop.notifications WHERE shop_id = $1 AND recipient_profile_id = $2',
      [config.shopId, actor.id]
    );
    const totalElements = parseInt(countRes.rows[0].count, 10);

    const unreadRes = await query(
      'SELECT count(*) FROM shop.notifications WHERE shop_id = $1 AND recipient_profile_id = $2 AND is_read = false',
      [config.shopId, actor.id]
    );
    const unreadCount = parseInt(unreadRes.rows[0].count, 10);

    const offset = Math.max(0, page) * pageSize;
    const dataRes = await query(
      `SELECT * FROM shop.notifications
       WHERE shop_id = $1 AND recipient_profile_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [config.shopId, actor.id, pageSize, offset]
    );

    return {
      content: dataRes.rows.map((n) => ({
        id: n.id,
        type: n.type,
        orderId: n.order_id,
        isRead: n.is_read,
        createdAt: toIso(n.created_at),
      })),
      page,
      size: pageSize,
      totalElements,
      totalPages: Math.ceil(totalElements / pageSize) || 0,
      unreadCount,
    };
  }

  async read(actor, id) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const res = await client.query(
        'SELECT * FROM shop.notifications WHERE id = $1',
        [id]
      );
      if (res.rows.length === 0) throw ApiException.missing();
      const n = res.rows[0];
      if (n.shop_id !== config.shopId || n.recipient_profile_id !== actor.id) {
        throw ApiException.missing();
      }

      await client.query(
        'UPDATE shop.notifications SET is_read = true, version = version + 1, updated_at = NOW() WHERE id = $1',
        [id]
      );
      return { success: true };
    });
  }

  async audit(actor, action, entityType, date, page, requestedSize) {
    this.profiles.seller(actor);
    ApiException.check(page >= 0 && page <= 100000, 400, 'INVALID_PAGE', 'Trang không hợp lệ.');

    const pageSize = size(requestedSize);
    const conditions = ['shop_id = $1'];
    const params = [config.shopId];
    let paramIndex = 2;

    if (action && action.trim()) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action.trim());
      paramIndex++;
    }

    if (entityType && entityType.trim()) {
      conditions.push(`entity_type = $${paramIndex}`);
      params.push(entityType.trim());
      paramIndex++;
    }

    if (date && date.trim()) {
      try {
        const parts = date.trim().split('-');
        if (parts.length !== 3) throw new Error('Invalid format');
        const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
        // Adjust to Vietnam timezone (UTC+7)
        const fromUtc = new Date(d.getTime() - 7 * 60 * 60 * 1000);
        const toUtc = new Date(fromUtc.getTime() + 24 * 60 * 60 * 1000);

        conditions.push(`created_at >= $${paramIndex} AND created_at < $${paramIndex + 1}`);
        params.push(fromUtc, toUtc);
        paramIndex += 2;
      } catch {
        throw new ApiException(400, 'INVALID_DATE', 'Ngày không hợp lệ.');
      }
    }

    const whereClause = conditions.join(' AND ');
    const countRes = await query(`SELECT count(*) FROM shop.audit_logs WHERE ${whereClause}`, params);
    const totalElements = parseInt(countRes.rows[0].count, 10);

    const offset = Math.max(0, page) * pageSize;
    const dataSql = `SELECT * FROM shop.audit_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataRes = await query(dataSql, [...params, pageSize, offset]);

    return {
      content: dataRes.rows.map((a) => ({
        id: a.id,
        actorId: a.actor_id,
        actorType: a.actor_type,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        safeBefore: a.safe_before,
        safeAfter: a.safe_after,
        requestId: a.request_id,
        createdAt: toIso(a.created_at),
      })),
      page,
      size: pageSize,
      totalElements,
      totalPages: Math.ceil(totalElements / pageSize) || 0,
    };
  }
}

let defaultSellerReadService = null;
export function getSellerReadService() {
  if (!defaultSellerReadService) {
    defaultSellerReadService = new SellerReadService();
  }
  return defaultSellerReadService;
}
