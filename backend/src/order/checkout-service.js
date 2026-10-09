import crypto from 'node:crypto';
import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { config } from '../config.js';
import { CryptoService, getCrypto } from '../identity/crypto.js';
import { normalizePhone } from '../identity/phone.js';
import { getAuditService } from '../audit/audit-service.js';
import { getShopService } from '../shop/shop-service.js';
import { getCatalogService } from '../catalog/catalog-service.js';
import { getInventoryService } from '../inventory/inventory-service.js';
import { getIdempotencyService } from '../infrastructure/idempotency-service.js';

export class CheckoutService {
  constructor(
    shopServiceInstance = getShopService(),
    catalogServiceInstance = getCatalogService(),
    inventoryServiceInstance = getInventoryService(),
    idempotencyServiceInstance = getIdempotencyService(),
    cryptoInstance = getCrypto(),
    auditServiceInstance = getAuditService()
  ) {
    this.settings = shopServiceInstance;
    this.catalog = catalogServiceInstance;
    this.inventory = inventoryServiceInstance;
    this.idem = idempotencyServiceInstance;
    this.crypto = cryptoInstance;
    this.audit = auditServiceInstance;
    this.pendingHours = config.pendingTtlHours;
    this.guestDays = config.guestTtlDays;
  }

  async resolve(input, client = null) {
    ApiException.check(
      input && Array.isArray(input) && input.length >= 1 && input.length <= 30,
      400,
      'INVALID_CART',
      'Giỏ cần 1–30 dòng.'
    );

    const seen = new Set();
    const lines = [];
    const demand = {};
    let total = 0;
    let signature = '';

    const sorted = [...input].sort((a, b) => {
      const cmp = (a.kind || '').localeCompare(b.kind || '');
      if (cmp !== 0) return cmp;
      return (a.catalogId || '').localeCompare(b.catalogId || '');
    });

    for (const req of sorted) {
      const qty = parseInt(req.quantity, 10);
      ApiException.check(
        !Number.isNaN(qty) && qty >= 1 && qty <= 20,
        400,
        'INVALID_QUANTITY',
        'Số lượng từ 1 đến 20.'
      );

      const key = `${req.kind}:${req.catalogId}`;
      ApiException.check(!seen.has(key), 400, 'DUPLICATE_CART_LINE', 'Gộp các dòng trùng trước khi gửi.');
      seen.add(key);

      let line;
      if (req.kind === 'PRODUCT') {
        const p = await this.catalog.product(req.catalogId, true, client);
        line = {
          request: req,
          name: p.name,
          image: p.image_asset_id,
          price: Number(p.price),
          version: Number(p.version),
          parts: [{ productId: p.id, name: p.name, quantity: 1 }],
        };
      } else if (req.kind === 'COMBO') {
        const c = await this.catalog.combo(req.catalogId, true, client);
        const parts = [];
        const rawParts = await this.catalog.components(c.id, client);

        for (const ci of rawParts) {
          const p = await this.catalog.product(ci.product_id, true, client);
          parts.push({ productId: p.id, name: p.name, quantity: ci.quantity });
          signature += `${p.id}:${p.version}:${p.price};`;
        }

        ApiException.check(parts.length >= 2, 409, 'CATALOG_UNAVAILABLE', 'Combo không thể đặt.');
        parts.sort((a, b) => a.productId.localeCompare(b.productId));

        line = {
          request: req,
          name: c.name,
          image: c.image_asset_id,
          price: Number(c.price),
          version: Number(c.version),
          parts,
        };
      } else {
        throw new ApiException(400, 'INVALID_KIND', 'Loại món không hợp lệ.');
      }

      lines.push(line);
      total += line.price * qty;
      signature += `${req.kind}${req.catalogId}:${qty}:${line.version}:${line.price};`;

      for (const part of line.parts) {
        const addQty = part.quantity * qty;
        demand[part.productId] = (demand[part.productId] || 0) + addQty;
        signature += `${part.productId}:${part.quantity};`;
      }
    }

    const shopRes = await query(
      'SELECT * FROM shop.shops WHERE id = $1',
      [config.shopId],
      client
    );
    const s = shopRes.rows[0];
    signature += `${s.version}:${s.payment_settings_version_id}:${s.accepting_orders}`;

    ApiException.check(
      total <= 99_999_999_999_999,
      400,
      'TOTAL_TOO_LARGE',
      'Tổng đơn vượt giới hạn.'
    );

    return {
      lines,
      demand,
      total,
      fingerprint: CryptoService.hash(signature),
    };
  }

  async quote(input) {
    return withTx(async (client) => {
      const s = await lockShop(client, config.shopId);

      if (input.paymentMethod === 'BANK_TRANSFER') {
        ApiException.check(
          Boolean(s.payment_settings_version_id),
          409,
          'BANK_NOT_CONFIGURED',
          'Shop chưa cấu hình chuyển khoản.'
        );
      }

      const resolved = await this.resolve(input.items, client);
      return this.quoteView(resolved, input.paymentMethod, client);
    });
  }

  async quoteView(resolved, method, client = null) {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const items = [];
    const insufficient = [];

    for (const [productId, reqQty] of Object.entries(resolved.demand)) {
      const invRes = await query(
        'SELECT * FROM shop.product_inventory WHERE id = $1',
        [productId],
        client
      );
      const i = invRes.rows[0] || { stock_on_hand: 0, stock_reserved: 0 };
      const avail = i.stock_on_hand - i.stock_reserved;
      if (avail < reqQty) {
        insufficient.push({
          productId,
          requiredQuantity: reqQty,
          availableQuantity: avail,
        });
      }
    }

    for (const l of resolved.lines) {
      let available = Number.MAX_SAFE_INTEGER;
      for (const part of l.parts) {
        const invRes = await query(
          'SELECT * FROM shop.product_inventory WHERE id = $1',
          [part.productId],
          client
        );
        const i = invRes.rows[0] || { stock_on_hand: 0, stock_reserved: 0 };
        const itemAvail = i.stock_on_hand - i.stock_reserved;
        available = Math.min(available, Math.floor(itemAvail / part.quantity));
      }

      const qty = parseInt(l.request.quantity, 10);
      items.push({
        kind: l.request.kind,
        catalogId: l.request.catalogId,
        name: l.name,
        unitPrice: l.price,
        quantity: qty,
        lineTotal: l.price * qty,
        availableStock: available,
        isAvailable: insufficient.length === 0,
      });
    }

    const expEpoch = Math.floor(expiresAt.getTime() / 1000);
    const quoteToken = this.crypto.sign(
      `quote|${resolved.fingerprint}|${method || 'ANY'}|${expEpoch}`
    );

    return {
      quoteToken,
      expiresAt: expiresAt.toISOString(),
      subtotal: resolved.total,
      total: resolved.total,
      items,
      isAvailable: insufficient.length === 0,
      stockConflicts: insufficient,
    };
  }

  async create(actor, key, input) {
    return withTx(async (client) => {
      await lockShop(client, config.shopId);

      return this.idem.run(
        client,
        actor,
        'create-order',
        key,
        input,
        async () => {
          const shopRes = await query(
            'SELECT * FROM shop.shops WHERE id = $1',
            [config.shopId],
            client
          );
          const s = shopRes.rows[0];

          ApiException.check(s.accepting_orders, 409, 'SHOP_CLOSED', 'Shop đang tạm dừng nhận đơn.');

          const pickup = await this.settings.pickup(input.pickupPointId, client);

          let resolved;
          try {
            resolved = await this.resolve(input.items, client);
          } catch (err) {
            if (err instanceof ApiException && err.status === 404) {
              throw new ApiException(409, 'CHECKOUT_CHANGED', 'Catalog đã thay đổi. Vui lòng kiểm tra lại giỏ.');
            }
            throw err;
          }

          let p;
          try {
            const verified = this.crypto.verify(input.quoteToken);
            p = verified.split('|');
          } catch {
            throw new ApiException(400, 'INVALID_QUOTE', 'Quote không hợp lệ.');
          }

          ApiException.check(
            p.length === 4 && p[0] === 'quote',
            400,
            'INVALID_QUOTE',
            'Quote không hợp lệ.'
          );

          const expEpoch = parseInt(p[3], 10);
          const nowEpoch = Math.floor(Date.now() / 1000);
          const validTime = !Number.isNaN(expEpoch) && expEpoch > nowEpoch;

          if (
            !validTime ||
            p[1] !== resolved.fingerprint ||
            (p[2] !== 'ANY' && p[2] !== input.paymentMethod)
          ) {
            const freshQuote = await this.quoteView(resolved, input.paymentMethod, client);
            throw new ApiException(
              409,
              'CHECKOUT_CHANGED',
              'Giá hoặc cấu hình đã thay đổi. Vui lòng xác nhận lại.',
              { quote: freshQuote }
            );
          }

          if (input.paymentMethod === 'BANK_TRANSFER') {
            ApiException.check(
              Boolean(s.payment_settings_version_id),
              409,
              'BANK_NOT_CONFIGURED',
              'Shop chưa cấu hình chuyển khoản.'
            );
          }

          if (input.requestedPickupAt) {
            const reqTime = new Date(input.requestedPickupAt);
            ApiException.check(
              reqTime > new Date(),
              400,
              'INVALID_PICKUP_TIME',
              'Thời gian nhận phải trong tương lai.'
            );
          }

          const buyer = input.buyer || {};
          const name = (buyer.fullName || '').trim();
          ApiException.check(name.length >= 2, 400, 'INVALID_BUYER_NAME', 'Họ tên cần ít nhất 2 ký tự.');

          const orderId = crypto.randomUUID();
          const orderCode = 'ORD-' + crypto.randomBytes(8).toString('hex').toUpperCase();
          const phone = normalizePhone(buyer.phone);
          const email = (buyer.email || '').trim();
          const buyerClass = buyer.className || null;

          const now = new Date();
          const reservationExpiresAt = new Date(now.getTime() + this.pendingHours * 60 * 60 * 1000);

          let guestAccessToken = null;
          let guestTokenHash = null;
          let guestTokenExpiresAt = null;

          if (!actor || actor.id == null) {
            guestAccessToken = this.crypto.token();
            guestTokenHash = CryptoService.hash(guestAccessToken);
            guestTokenExpiresAt = new Date(now.getTime() + this.guestDays * 24 * 60 * 60 * 1000);
          }

          const paymentSettingsVersionId =
            input.paymentMethod === 'BANK_TRANSFER' ? s.payment_settings_version_id : null;

          await client.query(
            `INSERT INTO shop.orders (
              id, shop_id, order_code, customer_id, buyer_name, buyer_phone, buyer_email,
              buyer_class, pickup_point_id, pickup_name, pickup_instructions,
              requested_at, confirmed_at, note, payment_method, payment_status, status,
              subtotal, total, received_amount, payment_settings_version_id,
              guest_token_hash, guest_token_expires_at, reservation_expires_at,
              version, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, null, $13, $14,
              'UNPAID', 'PENDING_CONTACT', $15, $16, 0, $17, $18, $19, $20, 0, NOW(), NOW()
            )`,
            [
              orderId,
              config.shopId,
              orderCode,
              actor ? actor.id : null,
              name,
              phone,
              email,
              buyerClass,
              pickup.id,
              pickup.name,
              pickup.instructions,
              input.requestedPickupAt ? new Date(input.requestedPickupAt) : null,
              input.note || null,
              input.paymentMethod,
              resolved.total,
              resolved.total,
              paymentSettingsVersionId,
              guestTokenHash,
              guestTokenExpiresAt,
              reservationExpiresAt,
            ]
          );

          for (const l of resolved.lines) {
            const itemId = crypto.randomUUID();
            const qty = parseInt(l.request.quantity, 10);
            const lineTotal = l.price * qty;

            await client.query(
              `INSERT INTO shop.order_items (
                id, order_id, kind, product_id, combo_id, name_snapshot,
                image_asset_id_snapshot, unit_price, quantity, line_total,
                version, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, NOW(), NOW())`,
              [
                itemId,
                orderId,
                l.request.kind,
                l.request.kind === 'PRODUCT' ? l.request.catalogId : null,
                l.request.kind === 'COMBO' ? l.request.catalogId : null,
                l.name,
                l.image || null,
                l.price,
                qty,
                lineTotal,
              ]
            );

            for (const part of l.parts) {
              const compId = crypto.randomUUID();
              await client.query(
                `INSERT INTO shop.order_item_components (
                  id, order_item_id, product_id, name_snapshot, units_per_item,
                  version, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())`,
                [compId, itemId, part.productId, part.name, part.quantity]
              );
            }
          }

          await this.inventory.reserve(client, orderId, resolved.demand, actor);

          const histId = crypto.randomUUID();
          await client.query(
            `INSERT INTO shop.order_status_history (
              id, order_id, from_status, to_status, actor_id, actor_type, reason,
              version, created_at, updated_at
            ) VALUES ($1, $2, null, 'PENDING_CONTACT', $3, $4, null, 0, NOW(), NOW())`,
            [histId, orderId, actor ? actor.id : null, actor ? actor.type : 'GUEST']
          );

          await this.audit.record(
            client,
            actor,
            'ORDER_CREATED',
            'ORDER',
            orderId,
            null,
            JSON.stringify({ total: resolved.total })
          );

          await this.audit.notifySellers(client, 'ORDER_CREATED', orderId);

          const out = {
            orderId,
            orderCode,
            status: 'PENDING_CONTACT',
            paymentStatus: 'UNPAID',
            total: resolved.total,
            reservationExpiresAt: reservationExpiresAt.toISOString(),
            version: 0,
          };
          if (guestAccessToken) {
            out.guestAccessToken = guestAccessToken;
          }
          return out;
        }
      );
    });
  }
}

let defaultCheckoutService = null;
export function getCheckoutService() {
  if (!defaultCheckoutService) {
    defaultCheckoutService = new CheckoutService();
  }
  return defaultCheckoutService;
}
