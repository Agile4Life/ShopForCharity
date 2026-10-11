import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { query, withTx } from '../common/db.js';
import { logger } from '../common/logger.js';
import { orderConfirmationEmail } from '../order/order-confirmation-email.js';

// Resend retains idempotency keys for 24h. Stop automatic retries before expiry.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export class OrderEmailService {
  constructor(settings = config, fetcher = (...args) => fetch(...args)) {
    this.settings = settings;
    this.fetcher = fetcher;
  }

  async enqueue(client, order) {
    const { rows: items } = await client.query(
      'SELECT name_snapshot, quantity, unit_price, line_total FROM shop.order_items WHERE order_id = $1 ORDER BY created_at, id', [order.id]);
    const { rows: shops } = await client.query('SELECT name, contact_phone, contact_email FROM shop.shops WHERE id = $1', [order.shop_id]);
    const message = orderConfirmationEmail(order, items, shops[0]);
    await client.query(`INSERT INTO shop.order_email_outbox(id, shop_id, order_id, kind, message)
      VALUES ($1,$2,$3,'ORDER_ACCEPTED',$4::jsonb) ON CONFLICT (order_id, kind) DO NOTHING`,
    [randomUUID(), order.shop_id, order.id, JSON.stringify(message)]);
  }

  async claim(orderId) {
    return withTx(async client => {
      const { rows } = await client.query(`SELECT * FROM shop.order_email_outbox
        WHERE shop_id = $1 AND ($2::uuid IS NULL OR order_id = $2)
          AND status IN ('PENDING','PROCESSING') AND next_attempt_at <= now()
        ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`, [this.settings.shopId, orderId]);
      const row = rows[0];
      if (!row) return null;
      if (row.first_attempt_at && Date.now() - new Date(row.first_attempt_at).getTime() >= RETRY_WINDOW_MS) {
        await client.query(`UPDATE shop.order_email_outbox SET status='FAILED', last_error='RETRY_WINDOW_EXPIRED',
          lease_token=NULL, updated_at=now() WHERE id=$1`, [row.id]);
        return { expired: true };
      }
      const token = randomUUID();
      // Persist the exact provider request before sending, including the sender.
      // A config change or process crash must not change a retried request body.
      const body = row.request_body || JSON.stringify({ ...row.message, from: this.settings.email.from });
      await client.query(`UPDATE shop.order_email_outbox SET status='PROCESSING', attempts=attempts+1,
        first_attempt_at=COALESCE(first_attempt_at,now()), request_body=$2, lease_token=$3,
        next_attempt_at=now()+interval '2 minutes', updated_at=now() WHERE id=$1`, [row.id, body, token]);
      return { ...row, attempts: row.attempts + 1, token, body };
    });
  }

  async deliver(orderId = null) {
    if (!this.settings.email.apiKey || !this.settings.email.from) {
      if (orderId) logger.warn('Order confirmation email is waiting for email configuration', { orderId });
      return false;
    }
    const row = await this.claim(orderId);
    if (!row) return false;
    if (row.expired) return true;
    let providerId = null, error = null, retryable = true;
    try {
      const response = await this.fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.settings.email.apiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `order-confirmation/${row.id}` },
        body: row.body, signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        error = `PROVIDER_HTTP_${response.status}`;
        retryable = response.status === 429 || response.status === 409 || response.status >= 500;
      } else {
        const result = await response.json();
        if (typeof result.id === 'string' && result.id) providerId = result.id;
        else error = 'PROVIDER_INVALID_RESPONSE';
      }
    } catch {
      error = 'PROVIDER_UNAVAILABLE';
    }
    if (providerId) {
      await query(`UPDATE shop.order_email_outbox SET status='SENT', provider_message_id=$3, sent_at=now(),
        lease_token=NULL, last_error=NULL, updated_at=now() WHERE id=$1 AND lease_token=$2`, [row.id, row.token, providerId]);
    } else {
      const status = retryable && row.attempts < 12 ? 'PENDING' : 'FAILED';
      const delay = Math.min(60 * 2 ** (row.attempts - 1), 3600);
      await query(`UPDATE shop.order_email_outbox SET status=$3, last_error=$4, lease_token=NULL,
        next_attempt_at=now()+($5 * interval '1 second'), updated_at=now() WHERE id=$1 AND lease_token=$2`,
      [row.id, row.token, status, error, delay]);
      logger.warn('Order confirmation email delivery failed', { orderId: row.order_id, code: error, status });
    }
    return true;
  }

  async deliverSafely(orderId) {
    try { await this.deliver(orderId); }
    catch { logger.error('Order confirmation email remains queued', { orderId }); }
  }

  async flush() {
    let processed = 0;
    // Bound cron duration on serverless; immediate order confirmations send one.
    while (processed < 5 && await this.deliver()) processed++;
    return { processed, configured: Boolean(this.settings.email.apiKey && this.settings.email.from) };
  }
}

let instance;
export function getOrderEmailService() {
  return instance ||= new OrderEmailService();
}
