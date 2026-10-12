import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '../src/migrations/migrate.js';

const resetSql = fs.readFileSync(new URL('../scripts/reset-business-data.sql', import.meta.url), 'utf8');
const cleared = ['order_email_outbox', 'notifications', 'payment_events', 'order_contact_attempts',
  'order_status_history', 'stock_reservations', 'inventory_movements', 'order_item_components',
  'order_items', 'orders', 'chat_reads', 'chat_messages', 'chat_conversations', 'combo_items',
  'combos', 'product_inventory', 'products', 'audit_logs', 'idempotency_keys'];

test('business reset clears linked history and product data while retaining accounts and launch settings', async () => {
  const db = new PGlite();
  try {
    await applyMigrations({ query: (sql, params) => sql.includes('pg_advisory_xact_lock')
      ? Promise.resolve({ rows: [] }) : params ? db.query(sql, params) : db.exec(sql).then(results => results.at(-1)) });
    await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, encrypted_password text);');
    const shop = '00000000-0000-0000-0000-000000000001';
    const user = randomUUID(), profile = randomUUID(), product = randomUUID(), pickup = randomUUID();
    const image = randomUUID(), qr = randomUUID(), bank = randomUUID(), order = randomUUID(), chat = randomUUID();
    await db.query("INSERT INTO auth.users VALUES($1,'account@example.com','unchanged-password')", [user]);
    await db.query("INSERT INTO shop.profiles(id,auth_user_id,role,active,created_at,updated_at) VALUES($1,$2,'SELLER',true,now(),now())", [profile, user]);
    for (const [id, type] of [[image, 'PRODUCT_IMAGE'], [qr, 'PAYMENT_QR']]) await db.query(`INSERT INTO shop.assets
      (id,shop_id,bucket,object_path,type,mime,size,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'image/png',100,now(),now())`,
    [id, shop, type === 'PRODUCT_IMAGE' ? 'product-images' : 'payment-qr', id + '.png', type]);
    await db.query(`INSERT INTO shop.payment_settings_versions(id,shop_id,bank_name,account_number,account_holder,qr_asset_id,created_at,updated_at)
      VALUES($1,$2,'Bank','123','Shop',$3,now(),now())`, [bank, shop, qr]);
    await db.query('UPDATE shop.shops SET payment_settings_version_id=$1, accepting_orders=true WHERE id=$2', [bank, shop]);
    await db.query("INSERT INTO shop.pickup_points(id,shop_id,name,active,created_at,updated_at) VALUES($1,$2,'Sảnh B',true,now(),now())", [pickup, shop]);
    await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,image_asset_id,status,created_at,updated_at)
      VALUES($1,$2,'00000000-0000-0000-0000-000000000011','old-product','Test',100,$3,'ACTIVE',now(),now())`, [product, shop, image]);
    await db.query('INSERT INTO shop.product_inventory(id,stock_on_hand,stock_reserved,created_at,updated_at) VALUES($1,10,1,now(),now())', [product]);
    await db.query(`INSERT INTO shop.orders(id,shop_id,order_code,customer_id,buyer_name,buyer_phone,buyer_email,pickup_point_id,pickup_name,
      payment_method,payment_status,status,subtotal,total,received_amount,reservation_expires_at,created_at,updated_at)
      VALUES($1,$2,'ORD-OLD',$3,'Test','0912345678','test@example.com',$4,'Sảnh B','CASH','UNPAID','PENDING_CONTACT',100,100,0,now()+interval '1 day',now(),now())`,
    [order, shop, profile, pickup]);
    const item = randomUUID();
    await db.query(`INSERT INTO shop.order_items(id,order_id,kind,product_id,name_snapshot,image_asset_id_snapshot,unit_price,quantity,line_total,created_at,updated_at)
      VALUES($1,$2,'PRODUCT',$3,'Test',$4,100,1,100,now(),now())`, [item, order, product, image]);
    await db.query(`INSERT INTO shop.order_item_components(id,order_item_id,product_id,name_snapshot,units_per_item,created_at,updated_at)
      VALUES($1,$2,$3,'Test',1,now(),now())`, [randomUUID(), item, product]);
    await db.query(`INSERT INTO shop.stock_reservations(id,order_id,product_id,quantity,state,created_at,updated_at)
      VALUES($1,$2,$3,1,'HELD',now(),now())`, [randomUUID(), order, product]);
    await db.query(`INSERT INTO shop.notifications(id,shop_id,recipient_profile_id,type,order_id,is_read,created_at,updated_at)
      VALUES($1,$2,$3,'ORDER_CREATED',$4,false,now(),now())`, [randomUUID(), shop, profile, order]);
    await db.query("INSERT INTO shop.order_email_outbox(id,shop_id,order_id,kind,message,status) VALUES($1,$2,$3,'ORDER_ACCEPTED','{}','PENDING')", [randomUUID(), shop, order]);
    await db.query('INSERT INTO shop.chat_conversations(id,shop_id,customer_id) VALUES($1,$2,$3)', [chat, shop, profile]);
    await db.query("INSERT INTO shop.chat_messages(id,conversation_id,sequence,sender_id,client_message_id,content,product_id) VALUES($1,$2,1,$3,$4,'Test',$5)", [randomUUID(), chat, profile, randomUUID(), product]);
    await db.query('INSERT INTO shop.chat_reads(conversation_id,profile_id,last_read_sequence) VALUES($1,$2,1)', [chat, profile]);
    const protectedTables = ['auth.users', 'shop.profiles', 'shop.shops', 'shop.categories', 'shop.pickup_points', 'shop.payment_settings_versions'];
    const protectedBefore = await Promise.all(protectedTables.map(table => db.query(`SELECT * FROM ${table} ORDER BY id`)));
    await db.exec(resetSql);
    for (const table of cleared) assert.equal((await db.query(`SELECT count(*)::int AS count FROM shop.${table}`)).rows[0].count, 0, table);
    for (const [index, table] of protectedTables.entries()) assert.deepEqual((await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows, protectedBefore[index].rows, table);
    assert.deepEqual((await db.query('SELECT id,type FROM shop.assets')).rows, [{ id: qr, type: 'PAYMENT_QR' }]);
    await db.exec(resetSql); // Safe to repeat when already empty.
    const extraShop = randomUUID();
    await db.query("INSERT INTO shop.shops(id,name,accepting_orders,created_at,updated_at) VALUES($1,'Other',false,now(),now())", [extraShop]);
    await assert.rejects(db.exec(resetSql), /exactly the configured shop/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM auth.users')).rows[0].count, 1);
  } finally { await db.close(); }
});
