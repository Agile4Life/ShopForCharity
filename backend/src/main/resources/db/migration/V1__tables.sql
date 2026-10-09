CREATE SCHEMA IF NOT EXISTS shop;

CREATE TABLE shop.shops (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  name text NOT NULL,
  contact_phone text,
  contact_email text,
  accepting_orders boolean NOT NULL,
  payment_settings_version_id uuid
);

CREATE TABLE shop.profiles (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  auth_user_id uuid NOT NULL,
  full_name text,
  phone text,
  email text,
  role text NOT NULL,
  active boolean NOT NULL
);

CREATE TABLE shop.categories (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL
);

CREATE TABLE shop.assets (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  bucket text NOT NULL,
  object_path text NOT NULL,
  thumbnail_path text,
  type text NOT NULL,
  mime text NOT NULL,
  size bigint NOT NULL,
  created_by uuid
);

CREATE TABLE shop.products (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  category_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(14,0) NOT NULL,
  image_asset_id uuid,
  status text NOT NULL,
  ingredients text,
  storage_instructions text
);

CREATE TABLE shop.product_inventory (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  stock_on_hand integer NOT NULL,
  stock_reserved integer NOT NULL
);

CREATE TABLE shop.combos (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(14,0) NOT NULL,
  image_asset_id uuid,
  status text NOT NULL
);

CREATE TABLE shop.combo_items (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  combo_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL
);

CREATE TABLE shop.pickup_points (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  name text NOT NULL,
  instructions text,
  active boolean NOT NULL
);

CREATE TABLE shop.payment_settings_versions (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_holder text NOT NULL,
  qr_asset_id uuid NOT NULL,
  created_by uuid
);

CREATE TABLE shop.orders (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  order_code text NOT NULL,
  customer_id uuid,
  buyer_name text NOT NULL,
  buyer_phone text NOT NULL,
  buyer_email text NOT NULL,
  buyer_class text,
  pickup_point_id uuid NOT NULL,
  pickup_name text NOT NULL,
  pickup_instructions text,
  requested_at timestamptz,
  confirmed_at timestamptz,
  note text,
  payment_method text NOT NULL,
  payment_status text NOT NULL,
  status text NOT NULL,
  subtotal numeric(14,0) NOT NULL,
  total numeric(14,0) NOT NULL,
  received_amount numeric(14,0) NOT NULL,
  payment_settings_version_id uuid,
  guest_token_hash text,
  guest_token_expires_at timestamptz,
  reservation_expires_at timestamptz NOT NULL
);

CREATE TABLE shop.order_items (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  order_id uuid NOT NULL,
  kind text NOT NULL,
  product_id uuid,
  combo_id uuid,
  name_snapshot text NOT NULL,
  image_asset_id_snapshot uuid,
  unit_price numeric(14,0) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(14,0) NOT NULL
);

CREATE TABLE shop.order_item_components (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  order_item_id uuid NOT NULL,
  product_id uuid NOT NULL,
  name_snapshot text NOT NULL,
  units_per_item integer NOT NULL
);

CREATE TABLE shop.stock_reservations (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL,
  state text NOT NULL
);

CREATE TABLE shop.inventory_movements (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  product_id uuid NOT NULL,
  order_id uuid,
  kind text NOT NULL,
  delta_on_hand integer NOT NULL,
  delta_reserved integer NOT NULL,
  reason text,
  actor_id uuid
);

CREATE TABLE shop.order_contact_attempts (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  order_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  channel text NOT NULL,
  outcome text NOT NULL,
  note text
);

CREATE TABLE shop.order_status_history (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL,
  reason text
);

CREATE TABLE shop.payment_events (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  order_id uuid NOT NULL,
  type text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  amount numeric(14,0),
  bank_reference text,
  actor_id uuid,
  note text,
  occurred_at timestamptz
);

CREATE TABLE shop.notifications (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  recipient_profile_id uuid NOT NULL,
  type text NOT NULL,
  order_id uuid,
  is_read boolean NOT NULL
);

CREATE TABLE shop.audit_logs (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  shop_id uuid NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  safe_before text,
  safe_after text,
  request_id text NOT NULL
);

CREATE TABLE shop.idempotency_keys (
  id uuid PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  caller_scope_hash text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  encrypted_response text NOT NULL,
  expires_at timestamptz NOT NULL
);
