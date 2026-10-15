-- Shop-configured referrer options for checkout and snapshot on orders.
ALTER TABLE shop.shops
  ADD COLUMN IF NOT EXISTS referrers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE shop.orders
  ADD COLUMN IF NOT EXISTS referrer text;
