-- Run as migration/schema owner after migrations. Provision shop_runtime separately
-- with LOGIN and a secret password; never make it owner/member of migration role.
GRANT USAGE ON SCHEMA shop TO shop_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shop TO shop_runtime;
REVOKE UPDATE, DELETE ON shop.audit_logs, shop.inventory_movements,
 shop.payment_events, shop.order_status_history, shop.order_contact_attempts,
 shop.payment_settings_versions FROM shop_runtime;
REVOKE ALL ON shop.flyway_schema_history FROM shop_runtime;
REVOKE CREATE ON SCHEMA public FROM shop_runtime;
