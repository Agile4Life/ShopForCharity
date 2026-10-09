import crypto from 'node:crypto';
import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { size, toIso, toNumber } from '../common/views.js';
import { config } from '../config.js';
import { OrderRules } from './order-rules.js';
import { getProfileService } from '../identity/profile-service.js';
import { getOrderAccess } from './order-access.js';
import { getShopService } from '../shop/shop-service.js';
import { getInventoryService } from '../inventory/inventory-service.js';
import { getIdempotencyService } from '../infrastructure/idempotency-service.js';
import { getAuditService } from '../audit/audit-service.js';
import { getCatalogService } from '../catalog/catalog-service.js';

export class OrderService {
  constructor(
    profileServiceInstance = getProfileService(),
    orderAccessInstance = getOrderAccess(),
    shopServiceInstance = getShopService(),
    inventoryServiceInstance = getInventoryService(),
    idempotencyServiceInstance = getIdempotencyService(),
    auditServiceInstance = getAuditService(),
    catalogServiceInstance = getCatalogService()
  ) {
    this.profiles = profileServiceInstance;
    this.access = orderAccessInstance;
    this.settings = shopServiceInstance;
    this.inventory = inventoryServiceInstance;
    this.idem = idempotencyServiceInstance;
    this.audit = auditServiceInstance;
    this.catalog = catalogServiceInstance;
  }

  async detail(actor, id, seller = false) {
    if (seller) this.profiles.seller(actor);
    const o = await this.access.owned(id, actor, seller);
    return this.view(o, seller);
  }

  async guestId(actor, code) {
    const o = await this.access.code(code, actor);
    return o.id;
  }

  async list(actor, seller, status, payment, code, date, page, requestedSize) {
    if (seller) this.profiles.seller(actor);
    ApiException.check(page >= 0 && page <= 100000, 400, 'INVALID_PAGE', 'Trang không hợp lệ.');

    const pageSize = size(requestedSize);
    const conditions = ['shop_id = $1'];
    const params = [config.shopId];
    let paramIndex = 2;

    if (!seller) {
      conditions.push(`customer_id = $${paramIndex}`);
      params.push(actor.id);
      paramIndex++;
    }

    if (status && status.trim()) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status.trim());
      paramIndex++;
    }

    if (payment && payment.trim()) {
      conditions.push(`payment_status = $${paramIndex}`);
      params.push(payment.trim());
      paramIndex++;
    }

    if (code && code.trim()) {
      conditions.push(`order_code = $${paramIndex}`);
      params.push(code.trim());
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
    const countRes = await query(`SELECT count(*) FROM shop.orders WHERE ${whereClause}`, params);
    const totalElements = parseInt(countRes.rows[0].count, 10);

    const offset = Math.max(0, page) * pageSize;
    const dataSql = `SELECT * FROM shop.orders WHERE ${whereClause} ORDER BY created_at DESC, id ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataRes = await query(dataSql, [...params, pageSize, offset]);

    return {
      content: dataRes.rows.map((o) => this.summary(o)),
      page,
      size: pageSize,
      totalElements,
      totalPages: Math.ceil(totalElements / pageSize) || 0,
    };
  }

  summary(o) {
    return {
      id: o.id,
      orderCode: o.order_code,
      buyerName: o.buyer_name,
      buyerPhone: o.buyer_phone,
      buyerEmail: o.buyer_email,
      pickupPointName: o.pickup_name,
      status: o.status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      total: toNumber(o.total),
      subtotal: toNumber(o.subtotal),
      requestedPickupAt: toIso(o.requested_at),
      confirmedPickupAt: toIso(o.confirmed_at),
      reservationExpiresAt: toIso(o.reservation_expires_at),
      version: Number(o.version),
      createdAt: toIso(o.created_at),
      updatedAt: toIso(o.updated_at),
      items: [],
    };
  }

  async view(o, seller = false, client = null) {
    const out = {
      id: o.id,
      orderCode: o.order_code,
      customerId: o.customer_id,
      buyerName: o.buyer_name,
      buyerPhone: o.buyer_phone,
      buyerEmail: o.buyer_email,
      buyerClass: o.buyer_class,
      pickupPointId: o.pickup_point_id,
      pickupPointName: o.pickup_name,
      pickupInstructions: o.pickup_instructions,
      requestedPickupAt: toIso(o.requested_at),
      confirmedPickupAt: toIso(o.confirmed_at),
      note: o.note,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      status: o.status,
      subtotal: toNumber(o.subtotal),
      total: toNumber(o.total),
      reservationExpiresAt: toIso(o.reservation_expires_at),
      version: Number(o.version),
      createdAt: toIso(o.created_at),
      updatedAt: toIso(o.updated_at),
    };

    const itemsRes = await query(
      'SELECT * FROM shop.order_items WHERE order_id = $1 ORDER BY created_at ASC',
      [o.id],
      client
    );

    const items = [];
    for (const item of itemsRes.rows) {
      const compRes = await query(
        'SELECT * FROM shop.order_item_components WHERE order_item_id = $1 ORDER BY created_at ASC',
        [item.id],
        client
      );

      const img = await this.catalog.image(item.image_asset_id_snapshot, client);
      const imgUrl = await this.catalog.imageUrl(item.image_asset_id_snapshot, client);

      items.push({
        id: item.id,
        kind: item.kind,
        productId: item.product_id,
        comboId: item.combo_id,
        nameSnapshot: item.name_snapshot,
        imageAssetIdSnapshot: item.image_asset_id_snapshot,
        image: img,
        imageUrlSnapshot: imgUrl,
        unitPrice: toNumber(item.unit_price),
        quantity: item.quantity,
        lineTotal: toNumber(item.line_total),
        components: compRes.rows.map((c) => ({
          productId: c.product_id,
          nameSnapshot: c.name_snapshot,
          unitsPerItem: c.units_per_item,
        })),
      });
    }
    out.items = items;

    const histRes = await query(
      'SELECT * FROM shop.order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
      [o.id],
      client
    );
    out.statusHistory = histRes.rows.map((h) => ({
      id: h.id,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      actorType: h.actor_type,
      reason: h.reason,
      createdAt: toIso(h.created_at),
    }));

    if (seller) {
      out.receivedAmount = toNumber(o.received_amount);
      out.paymentSettingsVersionId = o.payment_settings_version_id;

      const contactRes = await query(
        'SELECT * FROM shop.order_contact_attempts WHERE order_id = $1 ORDER BY created_at ASC',
        [o.id],
        client
      );
      out.contactAttempts = contactRes.rows.map((c) => ({
        id: c.id,
        sellerId: c.seller_id,
        channel: c.channel,
        outcome: c.outcome,
        note: c.note,
        createdAt: toIso(c.created_at),
      }));

      const paymentRes = await query(
        'SELECT * FROM shop.payment_events WHERE order_id = $1 ORDER BY created_at ASC',
        [o.id],
        client
      );
      out.paymentEvents = paymentRes.rows.map((p) => ({
        id: p.id,
        type: p.type,
        fromStatus: p.from_status,
        toStatus: p.to_status,
        amount: p.amount ? toNumber(p.amount) : null,
        bankReference: p.bank_reference,
        note: p.note,
        occurredAt: toIso(p.occurred_at),
        createdAt: toIso(p.created_at),
      }));
    }

    return out;
  }

  async action(actor, id, seller, action, key, input) {
    if (seller) this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const o = await this.access.owned(id, actor, seller, client);

      return this.idem.run(
        client,
        actor,
        `order:${id}:${action}`,
        key,
        input,
        async () => {
          ApiException.version(o.version, input.expectedVersion);

          let to;
          switch (action) {
            case 'accept':
              to = 'ACCEPTED';
              break;
            case 'prepare':
              to = 'PREPARING';
              break;
            case 'ready':
              to = 'READY';
              break;
            case 'complete':
              to = 'COMPLETED';
              break;
            case 'reject':
              to = 'REJECTED';
              break;
            case 'cancel':
              to = 'CANCELLED';
              break;
            default:
              throw new ApiException(400, 'INVALID_ACTION', 'Action không hợp lệ.');
          }

          const contactRes = await client.query(
            "SELECT count(*) FROM shop.order_contact_attempts WHERE order_id = $1 AND outcome = 'SUCCESS'",
            [id]
          );
          const hasContact = parseInt(contactRes.rows[0].count, 10) > 0;

          OrderRules.transition(o.status, to, o.payment_status, seller, hasContact);

          if (to === 'ACCEPTED') {
            const now = new Date();
            const expiresAt = new Date(o.reservation_expires_at);

            ApiException.check(
              expiresAt >= now || o.payment_status !== 'UNPAID',
              409,
              'RESERVATION_EXPIRED',
              'Đơn đã quá hạn giữ hàng.'
            );

            ApiException.check(
              input.confirmedPickupPointId &&
                input.confirmedPickupAt &&
                new Date(input.confirmedPickupAt) > now,
              400,
              'CONFIRMED_PICKUP_REQUIRED',
              'Cần xác nhận điểm và thời gian nhận.'
            );

            const pickup = await this.settings.pickup(input.confirmedPickupPointId, client);
            o.pickup_point_id = pickup.id;
            o.pickup_name = pickup.name;
            o.pickup_instructions = pickup.instructions;
            o.confirmed_at = new Date(input.confirmedPickupAt);
          }

          if (to === 'CANCELLED' || to === 'REJECTED') {
            ApiException.check(
              input.reason && input.reason.trim(),
              400,
              'REASON_REQUIRED',
              'Cần nhập lý do.'
            );
          }

          await this.transition(client, o, to, actor, input.reason || null);

          const updatedRes = await client.query(
            'SELECT * FROM shop.orders WHERE id = $1',
            [o.id]
          );
          return this.view(updatedRes.rows[0], seller, client);
        }
      );
    });
  }

  async contact(actor, id, key, input) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const o = await this.access.owned(id, actor, true, client);

      return this.idem.run(
        client,
        actor,
        `contact:${id}`,
        key,
        input,
        async () => {
          ApiException.version(o.version, input.expectedVersion);
          ApiException.check(!OrderRules.terminal(o.status), 409, 'INVALID_TRANSITION', 'Đơn đã kết thúc.');

          const contactId = crypto.randomUUID();
          await client.query(
            `INSERT INTO shop.order_contact_attempts (
              id, order_id, seller_id, channel, outcome, note,
              version, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW())`,
            [contactId, id, actor.id, input.channel, input.outcome, input.note || null]
          );

          await client.query(
            'UPDATE shop.orders SET version = version + 1, updated_at = NOW() WHERE id = $1',
            [id]
          );

          await this.audit.record(
            client,
            actor,
            'CONTACT_RECORDED',
            'ORDER',
            id,
            null,
            JSON.stringify({ outcome: input.outcome })
          );

          const updatedRes = await client.query(
            'SELECT * FROM shop.orders WHERE id = $1',
            [o.id]
          );
          return this.view(updatedRes.rows[0], true, client);
        }
      );
    });
  }

  async transition(client, o, to, actor, reason) {
    const from = o.status;
    o.status = to;

    if (OrderRules.terminal(to)) {
      await this.inventory.settle(client, o.id, to === 'COMPLETED', actor);

      if (to !== 'COMPLETED' && (o.payment_status === 'PAID' || Number(o.received_amount) > 0)) {
        const before = o.payment_status;
        o.payment_status = 'REFUND_PENDING';

        const eventId = crypto.randomUUID();
        await client.query(
          `INSERT INTO shop.payment_events (
            id, shop_id, order_id, type, from_status, to_status, amount,
            actor_id, occurred_at, version, created_at, updated_at
          ) VALUES ($1, $2, $3, 'REFUND_REQUIRED', $4, $5, $6, $7, NOW(), 0, NOW(), NOW())`,
          [
            eventId,
            config.shopId,
            o.id,
            before,
            o.payment_status,
            o.received_amount,
            actor ? actor.id : null,
          ]
        );

        await this.audit.record(client, actor, 'REFUND_REQUIRED', 'ORDER', o.id, null, null);
        await this.audit.notifySellers(client, 'REFUND_REQUIRED', o.id);
      } else if (o.payment_status === 'REPORTED') {
        await this.audit.notifySellers(client, 'PAYMENT_REVIEW_REQUIRED', o.id);
      }
    }

    const histId = crypto.randomUUID();
    await client.query(
      `INSERT INTO shop.order_status_history (
        id, order_id, from_status, to_status, actor_id, actor_type, reason,
        version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())`,
      [
        histId,
        o.id,
        from,
        to,
        actor ? actor.id : null,
        actor ? actor.type : 'SYSTEM',
        reason || null,
      ]
    );

    await client.query(
      `UPDATE shop.orders
       SET status = $1, payment_status = $2, pickup_point_id = $3, pickup_name = $4,
           pickup_instructions = $5, confirmed_at = $6, version = version + 1, updated_at = NOW()
       WHERE id = $7`,
      [
        o.status,
        o.payment_status,
        o.pickup_point_id,
        o.pickup_name,
        o.pickup_instructions,
        o.confirmed_at || null,
        o.id,
      ]
    );

    await this.audit.record(
      client,
      actor,
      `ORDER_${to}`,
      'ORDER',
      o.id,
      JSON.stringify({ status: from }),
      JSON.stringify({ status: to })
    );
  }

  async expire() {
    await withTx(async (client) => {
      await lockShop(client, config.shopId);

      const res = await client.query(
        `SELECT * FROM shop.orders
         WHERE shop_id = $1 AND status = 'PENDING_CONTACT' AND payment_status = 'UNPAID' AND reservation_expires_at <= NOW()`,
        [config.shopId]
      );

      for (const order of res.rows) {
        const lockRes = await client.query(
          'SELECT * FROM shop.orders WHERE id = $1 FOR UPDATE',
          [order.id]
        );
        const o = lockRes.rows[0];
        if (o.status === 'PENDING_CONTACT' && o.payment_status === 'UNPAID') {
          await this.transition(
            client,
            o,
            'EXPIRED',
            { id: null, type: 'SYSTEM', scope: 'system' },
            'Hết hạn giữ hàng.'
          );
        }
      }
    });
  }
}

let defaultOrderService = null;
export function getOrderService() {
  if (!defaultOrderService) {
    defaultOrderService = new OrderService();
  }
  return defaultOrderService;
}
