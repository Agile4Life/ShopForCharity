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
       WHERE shop_id = $1 AND payment_status = 'PAID' AND status IN ('ACCEPTED', 'PREPARING', 'READY', 'COMPLETED')`,
      [config.shopId]
    );

    const pendingRes = await query(
      `SELECT coalesce(sum(received_amount), 0) AS val FROM shop.orders
       WHERE shop_id = $1 AND status = 'PENDING_CONTACT'`,
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

    const resolvedCountRes = await query(
      `SELECT count(*) FROM shop.orders
       WHERE shop_id = $1 AND status IN ('ACCEPTED', 'PREPARING', 'READY', 'COMPLETED')`,
      [config.shopId]
    );

    return {
      pendingCount: parseInt(pendingCountRes.rows[0].count, 10),
      readyCount: parseInt(readyCountRes.rows[0].count, 10),
      resolvedCount: parseInt(resolvedCountRes.rows[0].count, 10),
      completedRevenue: toNumber(completedRes.rows[0].val),
      pendingRevenue: toNumber(pendingRes.rows[0].val),
    };
  }

  async notifications(actor, page, requestedSize, unreadOrders = false) {
    this.profiles.seller(actor);
    ApiException.check(page >= 0 && page <= 100000, 400, 'INVALID_PAGE', 'Trang không hợp lệ.');

    const pageSize = size(requestedSize);
    const filter = unreadOrders ? " AND is_read = false AND type = 'ORDER_CREATED'" : '';
    const countRes = await query(
      `SELECT count(*) FROM shop.notifications WHERE shop_id = $1 AND recipient_profile_id = $2${filter}`,
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
      `SELECT n.*, o.order_code, o.buyer_name, o.total AS order_total
       FROM shop.notifications n
       LEFT JOIN shop.orders o ON o.id = n.order_id AND o.shop_id = n.shop_id
       WHERE n.shop_id = $1 AND n.recipient_profile_id = $2${unreadOrders ? " AND n.is_read = false AND n.type = 'ORDER_CREATED'" : ''}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $3 OFFSET $4`,
      [config.shopId, actor.id, pageSize, offset]
    );

    return {
      content: dataRes.rows.map((n) => ({
        id: n.id,
        type: n.type,
        orderId: n.order_id,
        orderCode: n.order_code,
        buyerName: n.buyer_name,
        orderTotal: n.order_total == null ? null : toNumber(n.order_total),
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

  async confirmedOrders(actor, { orderCode, date, page = 0, size: requestedSize = 20 } = {}) {
    this.profiles.seller(actor);
    ApiException.check(Number.isInteger(page) && page >= 0 && page <= 100000,
      400, 'INVALID_PAGE', 'Trang không hợp lệ.');
    const pageSize = size(requestedSize);
    const conditions = ["o.shop_id = $1", "o.status IN ('ACCEPTED','PREPARING','READY','COMPLETED')"];
    const params = [config.shopId];
    if (orderCode !== undefined) {
      ApiException.check(typeof orderCode === 'string' && orderCode.length <= 100,
        400, 'INVALID_ORDER_CODE', 'Mã đơn không hợp lệ.');
      const code = orderCode.replace(/\s/g, '').toUpperCase();
      if (code) {
        ApiException.check(/^[A-Z0-9-]+$/.test(code), 400, 'INVALID_ORDER_CODE', 'Mã đơn không hợp lệ.');
        params.push(`${code}%`);
        conditions.push(`o.order_code LIKE $${params.length}`);
      }
    }
    if (date !== undefined && date !== '') {
      ApiException.check(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
        400, 'INVALID_DATE', 'Ngày không hợp lệ.');
      const start = new Date(`${date}T00:00:00.000Z`);
      ApiException.check(!Number.isNaN(start.getTime()) && start.toISOString().slice(0, 10) === date,
        400, 'INVALID_DATE', 'Ngày không hợp lệ.');
      const from = new Date(start.getTime() - 7 * 60 * 60 * 1000);
      params.push(from, new Date(from.getTime() + 24 * 60 * 60 * 1000));
      conditions.push(`h.created_at >= $${params.length - 1} AND h.created_at < $${params.length}`);
    }
    const limitIndex = params.length + 1;
    // Select one confirmation per order through the existing history_order index.
    // Summary and pagination share a single SQL snapshot; confirmed_at is the pickup appointment.
    const result = await query(`WITH confirmed_orders AS (
      SELECT o.id, o.order_code, o.buyer_name, o.buyer_phone, o.pickup_name,
        o.confirmed_at AS pickup_at, o.total, o.payment_status, o.status,
        h.created_at AS accepted_at, p.full_name AS accepted_by
      FROM shop.orders o
      LEFT JOIN LATERAL (
        SELECT created_at, actor_id FROM shop.order_status_history
        WHERE order_id = o.id AND to_status = 'ACCEPTED'
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) h ON true
      LEFT JOIN shop.profiles p ON p.id = h.actor_id
      WHERE ${conditions.join(' AND ')}
    ) SELECT count(*) AS total_elements, coalesce(sum(total),0) AS total_value,
      coalesce(sum(total) FILTER (WHERE payment_status = 'PAID'),0) AS paid_value,
      (SELECT coalesce(jsonb_agg(page_orders ORDER BY accepted_at DESC NULLS LAST, id DESC),'[]'::jsonb)
        FROM (SELECT * FROM confirmed_orders ORDER BY accepted_at DESC NULLS LAST, id DESC
          LIMIT $${limitIndex} OFFSET $${limitIndex + 1}) page_orders) AS content
      FROM confirmed_orders`, [...params, pageSize, page * pageSize]);
    const row = result.rows[0];
    const totalElements = toNumber(row.total_elements);
    return {
      content: row.content.map(o => ({
        id: o.id, orderCode: o.order_code, buyerName: o.buyer_name, buyerPhone: o.buyer_phone,
        pickupPointName: o.pickup_name, pickupAt: toIso(o.pickup_at), acceptedAt: toIso(o.accepted_at),
        acceptedBy: o.accepted_by, total: toNumber(o.total), paymentStatus: o.payment_status, status: o.status,
      })),
      page, size: pageSize, totalElements, totalPages: Math.ceil(totalElements / pageSize),
      summary: { totalValue: toNumber(row.total_value), paidValue: toNumber(row.paid_value) },
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
