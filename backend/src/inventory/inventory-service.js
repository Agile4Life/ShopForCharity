import crypto from 'node:crypto';
import { query, withTx, lockShop, lockInventory } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { config } from '../config.js';
import { getProfileService } from '../identity/profile-service.js';
import { getAuditService } from '../audit/audit-service.js';
import { getIdempotencyService } from '../infrastructure/idempotency-service.js';
import { getCatalogService } from '../catalog/catalog-service.js';

export class InventoryService {
  constructor(
    profileServiceInstance = getProfileService(),
    auditServiceInstance = getAuditService(),
    idempotencyServiceInstance = getIdempotencyService(),
    catalogServiceInstance = getCatalogService()
  ) {
    this.profiles = profileServiceInstance;
    this.audit = auditServiceInstance;
    this.idem = idempotencyServiceInstance;
    this.catalog = catalogServiceInstance;
  }

  async reserve(client, orderId, demand, actor) {
    const productIds = Object.keys(demand).sort();

    for (const productId of productIds) {
      const i = await lockInventory(client, productId);
      const qty = demand[productId];
      const available = i.stock_on_hand - i.stock_reserved;

      if (available < qty) {
        throw new ApiException(
          409,
          'INSUFFICIENT_STOCK',
          'Một số món không còn đủ số lượng.',
          [
            {
              field: 'items',
              catalogId: i.id,
              availableQuantity: available,
            },
          ]
        );
      }

      await client.query(
        `UPDATE shop.product_inventory
         SET stock_reserved = stock_reserved + $1, version = version + 1, updated_at = NOW()
         WHERE id = $2`,
        [qty, i.id]
      );

      const reservationId = crypto.randomUUID();
      await client.query(
        `INSERT INTO shop.stock_reservations (
          id, order_id, product_id, quantity, state, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'HELD', 0, NOW(), NOW())`,
        [reservationId, orderId, i.id, qty]
      );

      const movementId = crypto.randomUUID();
      await client.query(
        `INSERT INTO shop.inventory_movements (
          id, product_id, order_id, kind, delta_on_hand, delta_reserved,
          reason, actor_id, version, created_at, updated_at
        ) VALUES ($1, $2, $3, 'RESERVED', 0, $4, null, $5, 0, NOW(), NOW())`,
        [movementId, i.id, orderId, qty, actor ? actor.id : null]
      );

      await this.audit.record(
        client,
        actor,
        'STOCK_RESERVED',
        'PRODUCT',
        i.id,
        null,
        JSON.stringify({ quantity: qty })
      );
    }
  }

  async settle(client, orderId, consume, actor) {
    const res = await client.query(
      `SELECT * FROM shop.stock_reservations
       WHERE order_id = $1 AND state = 'HELD'
       ORDER BY product_id ASC`,
      [orderId]
    );

    for (const r of res.rows) {
      const i = await lockInventory(client, r.product_id);

      const newReserved = i.stock_reserved - r.quantity;
      const newOnHand = consume ? i.stock_on_hand - r.quantity : i.stock_on_hand;

      await client.query(
        `UPDATE shop.product_inventory
         SET stock_reserved = $1, stock_on_hand = $2, version = version + 1, updated_at = NOW()
         WHERE id = $3`,
        [newReserved, newOnHand, i.id]
      );

      const newState = consume ? 'CONSUMED' : 'RELEASED';
      await client.query(
        `UPDATE shop.stock_reservations
         SET state = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2`,
        [newState, r.id]
      );

      const movementId = crypto.randomUUID();
      await client.query(
        `INSERT INTO shop.inventory_movements (
          id, product_id, order_id, kind, delta_on_hand, delta_reserved,
          reason, actor_id, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, null, $7, 0, NOW(), NOW())`,
        [
          movementId,
          i.id,
          orderId,
          newState,
          consume ? -r.quantity : 0,
          -r.quantity,
          actor ? actor.id : null,
        ]
      );

      await this.audit.record(
        client,
        actor,
        consume ? 'STOCK_CONSUMED' : 'STOCK_RELEASED',
        'PRODUCT',
        i.id,
        null,
        JSON.stringify({ quantity: r.quantity })
      );
    }
  }

  async adjust(actor, id, key, input) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      await this.catalog.product(id, false, client);

      return this.idem.run(
        client,
        actor,
        `stock:${id}`,
        key,
        input,
        async () => {
          const i = await lockInventory(client, id);
          ApiException.version(i.version, input.expectedVersion);

          const hasOnHand = input.stockOnHand !== undefined && input.stockOnHand !== null;
          const hasDelta = input.deltaOnHand !== undefined && input.deltaOnHand !== null;

          ApiException.check(
            hasOnHand !== hasDelta,
            400,
            'INVALID_STOCK_INPUT',
            'Chọn stockOnHand hoặc deltaOnHand.'
          );

          const target = hasOnHand
            ? parseInt(input.stockOnHand, 10)
            : i.stock_on_hand + parseInt(input.deltaOnHand, 10);

          ApiException.check(
            target >= 0 && target <= 2147483647,
            400,
            'INVALID_STOCK',
            'Tồn kho vượt giới hạn.'
          );

          ApiException.check(
            target >= i.stock_reserved,
            409,
            'RESERVED_STOCK_CONFLICT',
            'Tổng tồn không được thấp hơn lượng đang giữ.'
          );

          const before = i.stock_on_hand;
          const delta = target - before;

          const updateRes = await client.query(
            `UPDATE shop.product_inventory
             SET stock_on_hand = $1, version = version + 1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [target, id]
          );
          const updated = updateRes.rows[0];

          const movementId = crypto.randomUUID();
          await client.query(
            `INSERT INTO shop.inventory_movements (
              id, product_id, order_id, kind, delta_on_hand, delta_reserved,
              reason, actor_id, version, created_at, updated_at
            ) VALUES ($1, $2, null, 'ADJUSTED', $3, 0, $4, $5, 0, NOW(), NOW())`,
            [movementId, id, delta, input.reason || null, actor.id]
          );

          await this.audit.record(
            client,
            actor,
            'STOCK_ADJUSTED',
            'PRODUCT',
            id,
            JSON.stringify({ stockOnHand: before }),
            JSON.stringify({ stockOnHand: target })
          );

          return {
            productId: id,
            stockOnHand: updated.stock_on_hand,
            stockReserved: updated.stock_reserved,
            availableStock: updated.stock_on_hand - updated.stock_reserved,
            version: Number(updated.version),
          };
        }
      );
    });
  }
}

let defaultInventoryService = null;
export function getInventoryService() {
  if (!defaultInventoryService) {
    defaultInventoryService = new InventoryService();
  }
  return defaultInventoryService;
}
