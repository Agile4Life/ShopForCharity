ALTER TABLE shop.profiles ADD UNIQUE(auth_user_id), ADD CHECK(role IN ('CUSTOMER','SELLER'));
ALTER TABLE shop.categories ADD UNIQUE(shop_id,code), ADD FOREIGN KEY(shop_id) REFERENCES shop.shops;
ALTER TABLE shop.assets ADD UNIQUE(object_path), ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD CHECK(type IN ('PRODUCT_IMAGE','PAYMENT_QR')), ADD CHECK(size>0);
ALTER TABLE shop.products ADD UNIQUE(shop_id,slug), ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(category_id) REFERENCES shop.categories, ADD FOREIGN KEY(image_asset_id) REFERENCES shop.assets, ADD CHECK(price>0), ADD CHECK(status IN ('DRAFT','ACTIVE','ARCHIVED'));
ALTER TABLE shop.product_inventory ADD FOREIGN KEY(id) REFERENCES shop.products, ADD CHECK(stock_reserved>=0 AND stock_on_hand>=stock_reserved);
ALTER TABLE shop.combos ADD UNIQUE(shop_id,slug), ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(image_asset_id) REFERENCES shop.assets, ADD CHECK(price>0), ADD CHECK(status IN ('DRAFT','ACTIVE','ARCHIVED'));
ALTER TABLE shop.combo_items ADD UNIQUE(combo_id,product_id), ADD FOREIGN KEY(combo_id) REFERENCES shop.combos, ADD FOREIGN KEY(product_id) REFERENCES shop.products, ADD CHECK(quantity>0);
ALTER TABLE shop.pickup_points ADD FOREIGN KEY(shop_id) REFERENCES shop.shops;
ALTER TABLE shop.payment_settings_versions ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(qr_asset_id) REFERENCES shop.assets;
ALTER TABLE shop.shops ADD FOREIGN KEY(payment_settings_version_id) REFERENCES shop.payment_settings_versions;
ALTER TABLE shop.orders ADD UNIQUE(order_code), ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(customer_id) REFERENCES shop.profiles, ADD FOREIGN KEY(pickup_point_id) REFERENCES shop.pickup_points, ADD FOREIGN KEY(payment_settings_version_id) REFERENCES shop.payment_settings_versions, ADD CHECK(total>0 AND total=subtotal AND received_amount>=0), ADD CHECK(payment_method IN ('CASH','BANK_TRANSFER')), ADD CHECK(payment_status IN ('UNPAID','REPORTED','PAID','REFUND_PENDING','REFUNDED')), ADD CHECK(status IN ('PENDING_CONTACT','ACCEPTED','PREPARING','READY','COMPLETED','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE shop.order_items ADD FOREIGN KEY(order_id) REFERENCES shop.orders, ADD FOREIGN KEY(product_id) REFERENCES shop.products, ADD FOREIGN KEY(combo_id) REFERENCES shop.combos, ADD FOREIGN KEY(image_asset_id_snapshot) REFERENCES shop.assets, ADD CHECK(quantity BETWEEN 1 AND 20), ADD CHECK(unit_price>0 AND line_total=unit_price*quantity), ADD CHECK((kind='PRODUCT' AND product_id IS NOT NULL AND combo_id IS NULL) OR (kind='COMBO' AND combo_id IS NOT NULL AND product_id IS NULL));
ALTER TABLE shop.order_item_components ADD UNIQUE(order_item_id,product_id), ADD FOREIGN KEY(order_item_id) REFERENCES shop.order_items, ADD FOREIGN KEY(product_id) REFERENCES shop.products, ADD CHECK(units_per_item>0);
ALTER TABLE shop.stock_reservations ADD UNIQUE(order_id,product_id), ADD FOREIGN KEY(order_id) REFERENCES shop.orders, ADD FOREIGN KEY(product_id) REFERENCES shop.products, ADD CHECK(quantity>0), ADD CHECK(state IN ('HELD','CONSUMED','RELEASED'));
ALTER TABLE shop.inventory_movements ADD FOREIGN KEY(product_id) REFERENCES shop.products, ADD FOREIGN KEY(order_id) REFERENCES shop.orders, ADD FOREIGN KEY(actor_id) REFERENCES shop.profiles;
ALTER TABLE shop.order_contact_attempts ADD FOREIGN KEY(order_id) REFERENCES shop.orders, ADD FOREIGN KEY(seller_id) REFERENCES shop.profiles, ADD CHECK(channel IN ('PHONE','EMAIL','IN_PERSON')), ADD CHECK(outcome IN ('SUCCESS','NO_RESPONSE','FAILED'));
ALTER TABLE shop.order_status_history ADD FOREIGN KEY(order_id) REFERENCES shop.orders, ADD FOREIGN KEY(actor_id) REFERENCES shop.profiles;
ALTER TABLE shop.payment_events ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(order_id) REFERENCES shop.orders, ADD FOREIGN KEY(actor_id) REFERENCES shop.profiles, ADD CHECK(amount IS NULL OR amount>0);
CREATE UNIQUE INDEX payment_bank_reference ON shop.payment_events(shop_id,bank_reference) WHERE bank_reference IS NOT NULL;
ALTER TABLE shop.notifications ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(recipient_profile_id) REFERENCES shop.profiles, ADD FOREIGN KEY(order_id) REFERENCES shop.orders;
ALTER TABLE shop.audit_logs ADD FOREIGN KEY(shop_id) REFERENCES shop.shops, ADD FOREIGN KEY(actor_id) REFERENCES shop.profiles;
ALTER TABLE shop.idempotency_keys ADD UNIQUE(caller_scope_hash,key);
CREATE INDEX product_catalog ON shop.products(shop_id,status,category_id,price);
CREATE INDEX combo_catalog ON shop.combos(shop_id,status,price);
CREATE INDEX order_seller_list ON shop.orders(shop_id,status,created_at DESC);
CREATE INDEX order_customer_list ON shop.orders(customer_id,created_at DESC);
CREATE INDEX order_expiry ON shop.orders(status,reservation_expires_at);
CREATE INDEX notification_recipient ON shop.notifications(recipient_profile_id,is_read,created_at DESC);
CREATE INDEX audit_shop ON shop.audit_logs(shop_id,created_at DESC);
CREATE INDEX audit_entity ON shop.audit_logs(entity_type,entity_id,created_at DESC);
CREATE INDEX idempotency_expiry ON shop.idempotency_keys(expires_at);
CREATE INDEX order_item_order ON shop.order_items(order_id);
CREATE INDEX order_component_item ON shop.order_item_components(order_item_id);
CREATE INDEX contact_order ON shop.order_contact_attempts(order_id);
CREATE INDEX history_order ON shop.order_status_history(order_id,created_at);
CREATE INDEX payment_order ON shop.payment_events(order_id);

INSERT INTO shop.shops(id,name,accepting_orders,created_at,updated_at) VALUES ('00000000-0000-0000-0000-000000000001','Shop trong trường',false,now(),now());
INSERT INTO shop.categories(id,shop_id,code,name,active,created_at,updated_at) VALUES
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','SNACK','Đồ ăn vặt',true,now(),now()),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','SOUVENIR','Đồ lưu niệm',true,now(),now());

REVOKE ALL ON SCHEMA shop FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA shop FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   REVOKE ALL ON SCHEMA shop FROM anon;
   REVOKE ALL ON ALL TABLES IN SCHEMA shop FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   REVOKE ALL ON SCHEMA shop FROM authenticated;
   REVOKE ALL ON ALL TABLES IN SCHEMA shop FROM authenticated;
 END IF;
END $$;
