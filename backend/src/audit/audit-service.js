import crypto from 'node:crypto';
import { config } from '../config.js';

export class AuditService {
  async record(client, actor, action, entityType, entityId, safeBefore = null, safeAfter = null, requestId = null) {
    const id = crypto.randomUUID();
    const actorId = actor ? actor.id : null;
    const actorType = actor ? actor.type : 'SYSTEM';
    const reqId = requestId || crypto.randomUUID();

    await client.query(
      `INSERT INTO shop.audit_logs (
        id, shop_id, actor_id, actor_type, action, entity_type, entity_id,
        safe_before, safe_after, request_id, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, NOW(), NOW())`,
      [
        id,
        config.shopId,
        actorId,
        actorType,
        action,
        entityType,
        entityId,
        safeBefore,
        safeAfter,
        reqId,
      ]
    );
  }

  async notifySellers(client, type, orderId) {
    const sellersRes = await client.query(
      "SELECT id FROM shop.profiles WHERE role = 'SELLER' AND active = true"
    );

    for (const seller of sellersRes.rows) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO shop.notifications (
          id, shop_id, recipient_profile_id, type, order_id, is_read,
          version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, false, 0, NOW(), NOW())`,
        [id, config.shopId, seller.id, type, orderId]
      );
    }
  }
}

let defaultAuditService = null;
export function getAuditService() {
  if (!defaultAuditService) {
    defaultAuditService = new AuditService();
  }
  return defaultAuditService;
}
