import crypto from 'node:crypto';
import { config } from '../config.js';
import { withTx, lockShop, lockInventory } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { getAuditService } from '../audit/audit-service.js';
import { CheckoutService } from '../order/checkout-service.js';
import { formatOrderSheetRow, isTotalRow, ORDER_SHEET_HEADERS } from './order-sheets-service.js';

const normalize = (value) => String(value ?? '').trim().normalize('NFC').toLocaleLowerCase('vi');
const paymentMethods = new Map([
  ['tiền mặt', 'CASH'], ['cash', 'CASH'],
  ['chuyển khoản qr', 'BANK_TRANSFER'], ['chuyển khoản', 'BANK_TRANSFER'], ['bank_transfer', 'BANK_TRANSFER'],
]);
const paymentStatuses = new Map([
  ['chưa thanh toán', 'UNPAID'], ['chưa thanh toán (đã báo ck)', 'REPORTED'],
  ['đã thanh toán', 'PAID'], ['chờ hoàn tiền', 'REFUND_PENDING'], ['đã hoàn tiền', 'REFUNDED'],
  ...['UNPAID', 'REPORTED', 'PAID', 'REFUND_PENDING', 'REFUNDED'].map((value) => [value.toLowerCase(), value]),
]);

function priceLines(lines, total) {
  const units = lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n);
  ApiException.check(BigInt(total) >= units, 422, 'SHEET_INVALID_TOTAL', 'Tổng tiền không đủ phân bổ giá dương cho các sản phẩm.');
  const weights = lines.map((line) => BigInt(line.product.price) * BigInt(line.quantity));
  const weight = weights.reduce((sum, value) => sum + value, 0n);
  const available = BigInt(total) - units;
  const amounts = lines.map((line, index) => BigInt(line.quantity) + available * weights[index] / weight);
  amounts[0] += BigInt(total) - amounts.reduce((sum, value) => sum + value, 0n);
  return lines.flatMap((line, index) => {
    const quantity = BigInt(line.quantity);
    const unitPrice = amounts[index] / quantity;
    const extra = amounts[index] % quantity;
    return [
      { ...line, quantity: Number(quantity - extra), unitPrice: String(unitPrice) },
      { ...line, quantity: Number(extra), unitPrice: String(unitPrice + 1n) },
    ].filter((entry) => entry.quantity > 0);
  });
}

export function parseSheetOrder(values) {
  if (!Array.isArray(values) || isTotalRow(values) || values.every((cell) => !String(cell ?? '').trim())) return null;
  const row = ORDER_SHEET_HEADERS.map((_, index) => String(values[index] ?? '').trim());
  const missing = [0, 1, 2, 5, 6, 7, 9].filter((index) => !row[index]);
  ApiException.check(!missing.length, 422, 'SHEET_ROW_INCOMPLETE', 'Dòng chưa đủ thông tin.',
    missing.map((index) => ({ field: ORDER_SHEET_HEADERS[index] })));
  const quantities = [3, 4].map((index) => {
    const value = row[index] === '' ? 0 : Number(row[index]);
    ApiException.check(Number.isInteger(value) && value >= 0 && value <= 2147483647,
      422, 'SHEET_INVALID_QUANTITY', 'Số lượng phải là số nguyên không âm.', [{ field: ORDER_SHEET_HEADERS[index] }]);
    return value;
  });
  ApiException.check(quantities.some((quantity) => quantity > 0), 422, 'SHEET_ITEMS_REQUIRED', 'Cần số lượng của ít nhất một loại hàng.');
  const total = Number(row[5]);
  ApiException.check(Number.isSafeInteger(total) && total > 0 && total <= 99999999999999,
    422, 'SHEET_INVALID_TOTAL', 'Tổng tiền phải là số nguyên dương.');
  const paymentMethod = paymentMethods.get(normalize(row[6]));
  const cancelled = normalize(row[7]) === 'đã hủy đơn';
  const paymentStatus = cancelled ? 'UNPAID' : paymentStatuses.get(normalize(row[7]));
  ApiException.check(paymentMethod && paymentStatus, 422, 'SHEET_INVALID_PAYMENT', 'Phương thức hoặc trạng thái thanh toán không hợp lệ.');
  return {
    name: row[0], phone: row[1], address: row[2], quantities, total, paymentMethod, paymentStatus,
    referrer: row[8] || null, note: row[9], cancelled,
  };
}

export class SheetOrderImportService {
  constructor(settings = config) { this.settings = settings; }

  async apply(orderId, values) {
    const input = parseSheetOrder(values);
    if (!input) return { status: 'ignored' };
    return withTx(async (client) => {
      const shop = await lockShop(client, this.settings.shopId);
      const existing = (await client.query('SELECT * FROM shop.orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
      ApiException.check(!existing || existing.shop_id === this.settings.shopId, 409, 'SHEET_ORDER_CONFLICT', 'Mã đơn không thuộc cửa hàng.');
      const oldItems = existing ? (await client.query('SELECT * FROM shop.order_items WHERE order_id=$1 ORDER BY created_at,id', [orderId])).rows : [];
      if (existing) {
        let previous = null;
        try { previous = parseSheetOrder(formatOrderSheetRow(existing, oldItems)); }
        catch (error) { if (!(error instanceof ApiException) || error.status !== 422) throw error; }
        if (JSON.stringify(previous) === JSON.stringify(input)) return { status: 'unchanged', orderId };
      }

      const quantitiesChanged = !existing || JSON.stringify(input.quantities) !== JSON.stringify(
        formatOrderSheetRow(existing, oldItems).slice(3, 5));
      const itemsChanged = quantitiesChanged || Number(existing?.total) !== input.total;
      // Exact product names avoid treating an unrelated catalog item as a sheet product.
      const products = itemsChanged ? (await client.query('SELECT * FROM shop.products WHERE shop_id=$1', [this.settings.shopId])).rows : [];
      const lines = itemsChanged ? input.quantities.flatMap((quantity, index) => {
        if (!quantity) return [];
        const candidates = products.filter((product) => normalize(product.name) === normalize(ORDER_SHEET_HEADERS[index + 3]));
        ApiException.check(candidates.length === 1, 409, 'SHEET_PRODUCT_UNRESOLVED',
          `Không xác định được sản phẩm ${ORDER_SHEET_HEADERS[index + 3]} trong danh mục.`);
        return [{ product: candidates[0], quantity }];
      }) : [];
      const status = input.cancelled ? 'CANCELLED' : existing?.status || 'ACCEPTED';
      ApiException.check(status !== 'COMPLETED' || input.paymentStatus === 'PAID', 409,
        'SHEET_COMPLETED_PAYMENT', 'Đơn hoàn tất phải giữ trạng thái đã thanh toán.');
      const received = ['PAID', 'REFUND_PENDING'].includes(input.paymentStatus) ? input.total : 0;
      if (!existing) {
        const code = await new CheckoutService().newOrderCode(client);
        await client.query(`INSERT INTO shop.orders (
          id,shop_id,order_code,buyer_name,buyer_phone,buyer_email,pickup_name,note,referrer,
          payment_method,payment_status,status,subtotal,total,received_amount,
          payment_settings_version_id,confirmed_at,reservation_expires_at,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,$5,'',$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,now(),now(),now(),now())`,
        [orderId, this.settings.shopId, code, input.name, input.phone, input.address, input.note, input.referrer,
          input.paymentMethod, input.paymentStatus, status, input.total, received,
          input.paymentMethod === 'BANK_TRANSFER' ? shop.payment_settings_version_id : null]);
      } else {
        await client.query(`UPDATE shop.orders SET buyer_name=$2,buyer_phone=$3,pickup_name=$4,
          pickup_instructions=null,pickup_point_id=null,note=$5,referrer=$6,payment_method=$7,
          payment_status=$8,status=$9,subtotal=$10,total=$10,received_amount=$11,
          payment_settings_version_id=$12,version=version+1,updated_at=now() WHERE id=$1`,
        [orderId, input.name, input.phone, input.address, input.note, input.referrer,
          input.paymentMethod, input.paymentStatus, status, input.total, received,
          input.paymentMethod === 'BANK_TRANSFER' ? shop.payment_settings_version_id : null]);
      }

      if (itemsChanged) {
        await client.query('DELETE FROM shop.order_item_components WHERE order_item_id IN (SELECT id FROM shop.order_items WHERE order_id=$1)', [orderId]);
        await client.query('DELETE FROM shop.order_items WHERE order_id=$1', [orderId]);
        for (const { product, quantity, unitPrice } of priceLines(lines, input.total)) {
          const itemId = crypto.randomUUID();
          await client.query(`INSERT INTO shop.order_items
            (id,order_id,kind,product_id,name_snapshot,image_asset_id_snapshot,unit_price,quantity,line_total,created_at,updated_at)
            VALUES ($1,$2,'PRODUCT',$3,$4,$5,$6,$7,$6::numeric*$7::integer,now(),now())`,
          [itemId, orderId, product.id, product.name, product.image_asset_id, unitPrice, quantity]);
          await client.query(`INSERT INTO shop.order_item_components
            (id,order_item_id,product_id,name_snapshot,units_per_item,created_at,updated_at)
            VALUES ($1,$2,$3,$4,1,now(),now())`, [crypto.randomUUID(), itemId, product.id, product.name]);
        }
      }
      if (quantitiesChanged || existing?.status !== status) await this.reconcileInventory(client, orderId, quantitiesChanged ? lines : null, status);
      if (!existing || existing.status !== status) {
        await client.query(`INSERT INTO shop.order_status_history
          (id,order_id,from_status,to_status,actor_type,reason,created_at,updated_at)
          VALUES ($1,$2,$3,$4,'SYSTEM','Google Sheets',now(),now())`,
        [crypto.randomUUID(), orderId, existing?.status || null, status]);
      }
      if (!existing || existing.payment_status !== input.paymentStatus || Number(existing.received_amount) !== received) {
        await client.query(`INSERT INTO shop.payment_events
          (id,shop_id,order_id,type,from_status,to_status,amount,note,occurred_at,created_at,updated_at)
          VALUES ($1,$2,$3,'SHEET_UPDATED',$4,$5,$6,'Google Sheets',now(),now(),now())`,
        [crypto.randomUUID(), this.settings.shopId, orderId, existing?.payment_status || 'UNPAID', input.paymentStatus, received || null]);
      }
      await getAuditService().record(client, null, existing ? 'SHEET_ORDER_UPDATED' : 'SHEET_ORDER_CREATED', 'ORDER', orderId);
      if (!existing) await getAuditService().notifySellers(client, 'ORDER_CREATED', orderId);
      return { status: existing ? 'updated' : 'created', orderId };
    });
  }

  async reconcileInventory(client, orderId, lines, status) {
    const old = (await client.query('SELECT * FROM shop.stock_reservations WHERE order_id=$1', [orderId])).rows;
    const desired = lines ? new Map(lines.map(({ product, quantity }) => [product.id, quantity]))
      : new Map(old.map((row) => [row.product_id, row.quantity]));
    const nextState = status === 'COMPLETED' ? 'CONSUMED' : ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(status) ? 'RELEASED' : 'HELD';
    const ids = [...new Set([...old.map((row) => row.product_id), ...desired.keys()])].sort();
    for (const id of ids) {
      const inventory = await lockInventory(client, id);
      const previous = old.find((row) => row.product_id === id);
      const quantity = desired.get(id) || 0;
      const onHandDelta = (previous?.state === 'CONSUMED' ? previous.quantity : 0) - (nextState === 'CONSUMED' ? quantity : 0);
      const reservedDelta = (nextState === 'HELD' ? quantity : 0) - (previous?.state === 'HELD' ? previous.quantity : 0);
      const onHand = inventory.stock_on_hand + onHandDelta;
      const reserved = inventory.stock_reserved + reservedDelta;
      ApiException.check(onHand >= reserved && reserved >= 0, 409, 'INSUFFICIENT_STOCK', 'Không đủ tồn kho cho số lượng trên Sheet.');
      await client.query(`UPDATE shop.product_inventory SET stock_on_hand=$2,stock_reserved=$3,
        version=version+1,updated_at=now() WHERE id=$1`, [id, onHand, reserved]);
      if (quantity) {
        await client.query(`INSERT INTO shop.stock_reservations
          (id,order_id,product_id,quantity,state,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,now(),now())
          ON CONFLICT(order_id,product_id) DO UPDATE SET quantity=excluded.quantity,state=excluded.state,
            version=shop.stock_reservations.version+1,updated_at=now()`,
        [crypto.randomUUID(), orderId, id, quantity, nextState]);
      } else if (previous) {
        await client.query("UPDATE shop.stock_reservations SET state='RELEASED',version=version+1,updated_at=now() WHERE id=$1", [previous.id]);
      }
      if (onHandDelta || reservedDelta) {
        await client.query(`INSERT INTO shop.inventory_movements
          (id,product_id,order_id,kind,delta_on_hand,delta_reserved,reason,created_at,updated_at)
          VALUES ($1,$2,$3,'ADJUSTED',$4,$5,'Google Sheets',now(),now())`,
        [crypto.randomUUID(), id, orderId, onHandDelta, reservedDelta]);
      }
    }
  }
}
