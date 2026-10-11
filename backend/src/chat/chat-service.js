import crypto from 'node:crypto';
import { query, withTx } from '../common/db.js';
import { config } from '../config.js';
import { ApiException } from '../common/api-exception.js';
import { getCatalogService } from '../catalog/catalog-service.js';

export function uuid(value) {
  ApiException.check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), 400, 'VALIDATION_ERROR', 'Mã dữ liệu không hợp lệ.');
  return value;
}
export function integer(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const n = value === undefined ? fallback : Number(value);
  ApiException.check(Number.isSafeInteger(n) && n >= 0 && n <= max, 400, 'VALIDATION_ERROR', 'Số trang hoặc vị trí tin nhắn không hợp lệ.');
  return n;
}
export class ChatService {
  constructor(catalog = getCatalogService()) { this.catalog = catalog; }

  async access(client, actor, id, lock = false) {
    uuid(id);
    // Check current DB state as well as the authenticated middleware actor.
    const result = await client.query(`SELECT c.* FROM shop.chat_conversations c
      JOIN shop.profiles p ON p.id = $2 AND p.active
      WHERE c.id = $1 AND c.shop_id = $3
      AND (p.role = 'SELLER' OR (p.role = 'CUSTOMER' AND c.customer_id = p.id))
      ${lock ? 'FOR UPDATE OF c' : ''}`, [id, actor.id, config.shopId]);
    if (!result.rows.length) throw ApiException.missing();
    return result.rows[0];
  }

  async own(actor) {
    ApiException.check(actor.type === 'CUSTOMER', 403, 'CUSTOMER_REQUIRED', 'Người bán vui lòng sử dụng hộp thư chung.');
    const result = await query(`INSERT INTO shop.chat_conversations(id,shop_id,customer_id)
      SELECT $1,$2,id FROM shop.profiles WHERE id=$3 AND active AND role='CUSTOMER'
      ON CONFLICT(shop_id,customer_id) DO UPDATE SET customer_id=EXCLUDED.customer_id RETURNING id`,
    [crypto.randomUUID(), config.shopId, actor.id]);
    if (!result.rows.length) throw ApiException.missing();
    return this.detail(actor, result.rows[0].id);
  }

  async summaries(actor, id = null, page = 0, size = 20, search = '') {
    const params = [actor.id, config.shopId, id, `%${search.replace(/[%_\\]/g, '').trim()}%`, size, page * size];
    const result = await query(`SELECT c.*, p.full_name AS customer_name,
      coalesce((SELECT count(*) FROM shop.chat_messages m WHERE m.conversation_id=c.id
        AND m.sender_id<>$1 AND m.sequence>coalesce(r.last_read_sequence,0)),0)::int AS unread_count,
      coalesce((SELECT max(rr.last_read_sequence) FROM shop.chat_reads rr JOIN shop.profiles pp ON pp.id=rr.profile_id
        WHERE rr.conversation_id=c.id AND pp.active AND
        ((viewer.role='SELLER' AND pp.id=c.customer_id) OR (viewer.role='CUSTOMER' AND pp.role='SELLER'))),0) AS recipient_read_sequence,
      last.content AS last_content, last.product_snapshot AS last_product, last.created_at AS last_message_at,
      count(*) OVER()::int AS total
      FROM shop.chat_conversations c JOIN shop.profiles p ON p.id=c.customer_id
      JOIN shop.profiles viewer ON viewer.id=$1 AND viewer.active
      LEFT JOIN shop.chat_reads r ON r.conversation_id=c.id AND r.profile_id=$1
      LEFT JOIN shop.chat_messages last ON last.conversation_id=c.id AND last.sequence=c.last_sequence
      WHERE c.shop_id=$2 AND (viewer.role='SELLER' OR (viewer.role='CUSTOMER' AND c.customer_id=$1))
        AND ($3::uuid IS NULL OR c.id=$3) AND coalesce(p.full_name,'Khách hàng') ILIKE $4
      ORDER BY c.updated_at DESC,c.id LIMIT $5 OFFSET $6`, params);
    return { content: result.rows.map(c => ({ id: c.id, customerName: c.customer_name || 'Khách hàng',
      lastSequence: Number(c.last_sequence), unreadCount: c.unread_count,
      recipientReadSequence: Number(c.recipient_read_sequence),
      lastMessage: c.last_content || c.last_product?.name || '', lastMessageAt: c.last_message_at,
      createdAt: c.created_at, updatedAt: c.updated_at })),
    page, size, totalElements: result.rows[0]?.total || 0, totalPages: Math.ceil((result.rows[0]?.total || 0) / size) };
  }

  async detail(actor, id) {
    await this.access({ query }, actor, id);
    return (await this.summaries(actor, id)).content[0];
  }
  async list(actor, input) {
    ApiException.check(actor.type === 'SELLER', 403, 'SELLER_REQUIRED', 'Chỉ người bán được xem hộp thư chung.');
    ApiException.check(!input.q || (typeof input.q === 'string' && input.q.length <= 100), 400, 'VALIDATION_ERROR', 'Từ khóa quá dài.');
    const page = integer(input.page, 0, 100000);
    const size = Math.max(1, integer(input.size, 20, 50));
    return this.summaries(actor, null, page, size, input.q || '');
  }
  async unread(actor) {
    const result = await query(`SELECT count(*)::int AS count FROM shop.chat_messages m
      JOIN shop.chat_conversations c ON c.id=m.conversation_id
      JOIN shop.profiles p ON p.id=$1 AND p.active
      LEFT JOIN shop.chat_reads r ON r.conversation_id=c.id AND r.profile_id=$1
      WHERE c.shop_id=$2 AND (p.role='SELLER' OR (p.role='CUSTOMER' AND c.customer_id=p.id))
        AND m.sender_id<>$1 AND m.sequence>coalesce(r.last_read_sequence,0)`, [actor.id, config.shopId]);
    return { count: result.rows[0].count };
  }
  message(m) {
    return { id: m.id, conversationId: m.conversation_id, sequence: Number(m.sequence),
      senderId: m.sender_id, senderName: m.sender_name || 'Khách hàng', senderRole: m.sender_role,
      clientMessageId: m.client_message_id, content: m.content, product: m.product_snapshot,
      createdAt: m.created_at };
  }
  async messages(actor, id, input) {
    await this.access({ query }, actor, id);
    const before = input.before === undefined ? null : integer(input.before, 0);
    const size = Math.max(1, integer(input.size, 40, 50));
    const result = await query(`SELECT m.*,p.full_name AS sender_name,p.role AS sender_role
      FROM shop.chat_messages m JOIN shop.profiles p ON p.id=m.sender_id
      WHERE m.conversation_id=$1 AND ($2::bigint IS NULL OR m.sequence<$2)
      ORDER BY m.sequence DESC LIMIT $3`, [id, before, size + 1]);
    const rows = result.rows.slice(0, size).reverse();
    return { content: rows.map(m => this.message(m)), nextBefore: result.rows.length > size ? Number(rows[0].sequence) : null };
  }
  async send(actor, id, input) {
    uuid(input.clientMessageId);
    ApiException.check(input.content === undefined || typeof input.content === 'string', 400, 'VALIDATION_ERROR', 'Nội dung tin nhắn không hợp lệ.');
    const content = (input.content || '').trim();
    ApiException.check(content.length <= 4000 && (content || input.productId), 400, 'VALIDATION_ERROR', 'Nhập tin nhắn tối đa 4.000 ký tự hoặc chọn sản phẩm.');
    if (input.productId) uuid(input.productId);
    return withTx(async client => {
      const c = await this.access(client, actor, id, true);
      const existing = await client.query(`SELECT m.*,p.full_name AS sender_name,p.role AS sender_role FROM shop.chat_messages m
        JOIN shop.profiles p ON p.id=m.sender_id WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3`, [id, actor.id, input.clientMessageId]);
      if (existing.rows.length) {
        const m = existing.rows[0];
        ApiException.check(m.content === content && (m.product_snapshot?.id || null) === (input.productId || null), 409, 'IDEMPOTENCY_MISMATCH', 'Tin nhắn này đã được gửi với nội dung khác.');
        return this.message(m);
      }
      let snapshot = null;
      if (input.productId) {
        const p = await this.catalog.product(input.productId, true, client);
        snapshot = { id: p.id, slug: p.slug, name: p.name, price: Number(p.price), imageUrl: await this.catalog.imageUrl(p.image_asset_id, client) };
      }
      const next = Number(c.last_sequence) + 1;
      await client.query('UPDATE shop.chat_conversations SET last_sequence=$2,updated_at=now() WHERE id=$1', [id, next]);
      const result = await client.query(`INSERT INTO shop.chat_messages(id,conversation_id,sequence,sender_id,client_message_id,content,product_id,product_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [crypto.randomUUID(), id, next, actor.id, input.clientMessageId, content, input.productId || null, snapshot]);
      const p = (await client.query('SELECT full_name,role FROM shop.profiles WHERE id=$1', [actor.id])).rows[0];
      return this.message({ ...result.rows[0], sender_name: p.full_name, sender_role: p.role });
    });
  }
  async read(actor, id, input) {
    const sequence = integer(input.sequence, -1);
    return withTx(async client => {
      const c = await this.access(client, actor, id, true);
      ApiException.check(sequence <= Number(c.last_sequence), 400, 'VALIDATION_ERROR', 'Vị trí tin nhắn chưa tồn tại.');
      await client.query(`INSERT INTO shop.chat_reads(conversation_id,profile_id,last_read_sequence) VALUES($1,$2,$3)
        ON CONFLICT(conversation_id,profile_id) DO UPDATE SET last_read_sequence=greatest(chat_reads.last_read_sequence,EXCLUDED.last_read_sequence),updated_at=now()
        WHERE chat_reads.last_read_sequence<EXCLUDED.last_read_sequence`, [id, actor.id, sequence]);
      return { success: true };
    });
  }
}
export const chatService = new ChatService();
