-- Explicit one-shop maintenance operation. Never run automatically at startup.
-- Retains accounts, shop settings, categories, pickup points and bank/QR settings.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $reset$
DECLARE
  expected_shop_id constant uuid := '00000000-0000-0000-0000-000000000001';
  users_before jsonb;
  profiles_before jsonb;
  settings_before jsonb;
  settings_after jsonb;
BEGIN
  IF (SELECT count(*) FROM shop.shops) <> 1 OR
     NOT EXISTS (SELECT 1 FROM shop.shops WHERE id = expected_shop_id) THEN
    RAISE EXCEPTION 'Reset requires exactly the configured shop; no data was deleted.';
  END IF;
  PERFORM id FROM shop.shops WHERE id = expected_shop_id FOR UPDATE;
  LOCK TABLE auth.users, shop.profiles IN SHARE MODE;
  IF EXISTS (SELECT 1 FROM shop.order_email_outbox WHERE status = 'PROCESSING') THEN
    RAISE EXCEPTION 'An email is being processed; retry after delivery completes.';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb) INTO users_before FROM auth.users u;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id), '[]'::jsonb) INTO profiles_before FROM shop.profiles p;
  SELECT jsonb_build_object(
    'shops', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM shop.shops s),
    'categories', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM shop.categories c),
    'pickup', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM shop.pickup_points p),
    'bank', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM shop.payment_settings_versions b),
    'qr', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM shop.assets a WHERE type = 'PAYMENT_QR')
  ) INTO settings_before;

  DELETE FROM shop.order_email_outbox;
  DELETE FROM shop.notifications;
  DELETE FROM shop.payment_events;
  DELETE FROM shop.order_contact_attempts;
  DELETE FROM shop.order_status_history;
  DELETE FROM shop.stock_reservations;
  DELETE FROM shop.inventory_movements;
  DELETE FROM shop.order_item_components;
  DELETE FROM shop.order_items;
  DELETE FROM shop.orders;
  DELETE FROM shop.chat_reads;
  DELETE FROM shop.chat_messages;
  DELETE FROM shop.chat_conversations;
  DELETE FROM shop.combo_items;
  DELETE FROM shop.combos;
  DELETE FROM shop.product_inventory;
  DELETE FROM shop.products;
  DELETE FROM shop.audit_logs;
  DELETE FROM shop.idempotency_keys;
  -- Delete metadata only here. Remove the captured product image paths through
  -- the Storage API afterwards; never DELETE from storage.objects via SQL.
  DELETE FROM shop.assets WHERE shop_id = expected_shop_id AND type = 'PRODUCT_IMAGE';

  IF users_before IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb) FROM auth.users u) OR
     profiles_before IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id), '[]'::jsonb) FROM shop.profiles p) THEN
    RAISE EXCEPTION 'Account preservation check failed; reset rolled back.';
  END IF;
  SELECT jsonb_build_object(
    'shops', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM shop.shops s),
    'categories', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM shop.categories c),
    'pickup', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM shop.pickup_points p),
    'bank', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM shop.payment_settings_versions b),
    'qr', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM shop.assets a WHERE type = 'PAYMENT_QR')
  ) INTO settings_after;
  IF settings_before IS DISTINCT FROM settings_after THEN
    RAISE EXCEPTION 'Shop configuration preservation check failed; reset rolled back.';
  END IF;
END;
$reset$;
COMMIT;
