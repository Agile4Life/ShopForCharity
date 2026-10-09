import crypto from 'node:crypto';
import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { toNumber, toIso } from '../common/views.js';
import { config } from '../config.js';
import { OrderRules } from '../order/order-rules.js';
import { getProfileService } from '../identity/profile-service.js';
import { getOrderAccess } from '../order/order-access.js';
import { getOrderService } from '../order/order-service.js';
import { getIdempotencyService } from '../infrastructure/idempotency-service.js';
import { getAuditService } from '../audit/audit-service.js';
import { getStorage } from '../infrastructure/storage.js';

export class PaymentService {
  constructor(
    profileServiceInstance = getProfileService(),
    orderAccessInstance = getOrderAccess(),
    orderServiceInstance = getOrderService(),
    idempotencyServiceInstance = getIdempotencyService(),
    auditServiceInstance = getAuditService(),
    storageInstance = getStorage()
  ) {
    this.profiles = profileServiceInstance;
    this.access = orderAccessInstance;
    this.orders = orderServiceInstance;
    this.idem = idempotencyServiceInstance;
    this.audit = auditServiceInstance;
    this.storage = storageInstance;
  }

  async action(actor, id, seller, action, key, input) {
    if (seller) this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const o = await this.access.owned(id, actor, seller, client);

      return this.idem.run(
        client,
        actor,
        `payment:${id}:${action}`,
        key,
        input,
        async () => {
          ApiException.version(o.version, input.expectedVersion);
          const from = o.payment_status;
          let amount = null;
          let reference = null;
          let event;

          switch (action) {
            case 'payment-report': {
              ApiException.check(
                o.payment_method === 'BANK_TRANSFER' &&
                  ['ACCEPTED', 'PREPARING', 'READY'].includes(o.status) &&
                  from === 'UNPAID',
                409,
                'INVALID_PAYMENT_TRANSITION',
                'Chỉ báo chuyển khoản sau khi đơn được chấp nhận.'
              );
              o.payment_status = 'REPORTED';
              event = 'PAYMENT_REPORTED';
              await this.audit.notifySellers(client, event, id);
              break;
            }
            case 'confirm-payment': {
              ApiException.check(seller, 403, 'SELLER_REQUIRED', 'Chỉ người bán được xác nhận tiền.');
              ApiException.check(
                ['UNPAID', 'REPORTED'].includes(from),
                409,
                'INVALID_PAYMENT_TRANSITION',
                'Khoản nhận đã được xử lý.'
              );
              ApiException.check(
                input.amount !== undefined && input.amount !== null,
                400,
                'AMOUNT_REQUIRED',
                'Cần nhập số tiền thực nhận.'
              );

              amount = Number(input.amount);
              o.received_amount = Number(o.received_amount) + amount;

              if (OrderRules.terminal(o.status) && o.status !== 'COMPLETED') {
                o.payment_status = 'REFUND_PENDING';
                event = 'PAYMENT_RECEIVED_AFTER_CANCELLATION';
                await this.audit.notifySellers(client, 'REFUND_REQUIRED', id);
              } else {
                ApiException.check(
                  o.status !== 'COMPLETED',
                  409,
                  'INVALID_PAYMENT_TRANSITION',
                  'Đơn đã hoàn tất.'
                );
                const isExact = o.received_amount === Number(o.total);
                o.payment_status = isExact ? 'PAID' : 'REPORTED';
                event = isExact ? 'PAYMENT_CONFIRMED' : 'PAYMENT_RECONCILIATION_REQUIRED';
                if (!isExact) {
                  await this.audit.notifySellers(client, event, id);
                }
              }
              reference = await this.reference(client, input.bankReference);
              break;
            }
            case 'dismiss-payment-report': {
              ApiException.check(
                seller && from === 'REPORTED' && Number(o.received_amount) === 0,
                409,
                'INVALID_PAYMENT_TRANSITION',
                'Không được bác báo cáo khi đã ghi nhận tiền thực nhận.'
              );
              ApiException.check(
                input.reason && input.reason.trim(),
                400,
                'REASON_REQUIRED',
                'Cần nhập lý do.'
              );
              o.payment_status = 'UNPAID';
              event = 'PAYMENT_REPORT_DISMISSED';
              break;
            }
            case 'confirm-refund': {
              ApiException.check(
                seller && from === 'REFUND_PENDING',
                409,
                'INVALID_PAYMENT_TRANSITION',
                'Đơn không chờ hoàn tiền.'
              );
              ApiException.check(
                input.amount !== undefined &&
                  input.amount !== null &&
                  Number(input.amount) === Number(o.received_amount),
                400,
                'REFUND_AMOUNT_MISMATCH',
                'Cần xác nhận hoàn đủ số tiền đã nhận.'
              );
              amount = Number(input.amount);
              reference = await this.reference(client, input.bankReference);
              o.payment_status = 'REFUNDED';
              event = 'REFUND_CONFIRMED';
              break;
            }
            default:
              throw new ApiException(400, 'INVALID_ACTION', 'Action không hợp lệ.');
          }

          const eventId = crypto.randomUUID();
          await client.query(
            `INSERT INTO shop.payment_events (
              id, shop_id, order_id, type, from_status, to_status, amount,
              bank_reference, actor_id, note, occurred_at, version, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, NOW(), NOW())`,
            [
              eventId,
              config.shopId,
              o.id,
              event,
              from,
              o.payment_status,
              amount,
              reference,
              actor ? actor.id : null,
              input.note || null,
              input.occurredAt ? new Date(input.occurredAt) : new Date(),
            ]
          );

          await client.query(
            `UPDATE shop.orders
             SET payment_status = $1, received_amount = $2, version = version + 1, updated_at = NOW()
             WHERE id = $3`,
            [o.payment_status, o.received_amount, o.id]
          );

          await this.audit.record(
            client,
            actor,
            event,
            'ORDER',
            id,
            JSON.stringify({ paymentStatus: from }),
            JSON.stringify({ paymentStatus: o.payment_status })
          );

          const updatedRes = await client.query('SELECT * FROM shop.orders WHERE id = $1', [o.id]);
          return this.orders.view(updatedRes.rows[0], seller, client);
        }
      );
    });
  }

  async reference(client, reference) {
    if (!reference || !reference.trim()) return null;
    const normalized = reference.trim();

    const res = await client.query(
      'SELECT count(*) FROM shop.payment_events WHERE shop_id = $1 AND bank_reference = $2',
      [config.shopId, normalized]
    );

    ApiException.check(
      parseInt(res.rows[0].count, 10) === 0,
      409,
      'BANK_REFERENCE_DUPLICATE',
      'Tham chiếu giao dịch đã được sử dụng.'
    );

    return normalized;
  }

  async instructions(actor, id, seller = false) {
    if (seller) this.profiles.seller(actor);
    const o = await this.access.owned(id, actor, seller);

    ApiException.check(
      o.payment_method === 'BANK_TRANSFER' && o.payment_settings_version_id != null,
      409,
      'NO_BANK_INSTRUCTIONS',
      'Đơn không dùng chuyển khoản.'
    );

    const settingsRes = await query(
      'SELECT * FROM shop.payment_settings_versions WHERE id = $1',
      [o.payment_settings_version_id]
    );
    if (settingsRes.rows.length === 0) throw ApiException.missing();
    const settings = settingsRes.rows[0];

    const assetRes = await query(
      'SELECT * FROM shop.assets WHERE id = $1',
      [settings.qr_asset_id]
    );
    if (assetRes.rows.length === 0) throw ApiException.missing();
    const asset = assetRes.rows[0];

    return {
      orderCode: o.order_code,
      bankName: settings.bank_name,
      accountNumber: settings.account_number,
      accountHolder: settings.account_holder,
      amount: toNumber(o.total),
      transferContent: o.order_code,
      qrSignedUrl: await this.storage.signed(asset.bucket, asset.object_path, 300),
      expiresIn: 300,
      paymentSettingsVersionId: settings.id,
      waitForAcceptance: o.status === 'PENDING_CONTACT',
    };
  }
}

let defaultPaymentService = null;
export function getPaymentService() {
  if (!defaultPaymentService) {
    defaultPaymentService = new PaymentService();
  }
  return defaultPaymentService;
}
