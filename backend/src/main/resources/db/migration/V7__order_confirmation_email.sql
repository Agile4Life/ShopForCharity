CREATE TABLE shop.order_email_outbox (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shop.shops(id),
  order_id uuid NOT NULL REFERENCES shop.orders(id),
  kind text NOT NULL CHECK (kind = 'ORDER_ACCEPTED'),
  message jsonb NOT NULL,
  request_body text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);
CREATE INDEX order_email_outbox_pending ON shop.order_email_outbox(shop_id, next_attempt_at, id)
  WHERE status IN ('PENDING','PROCESSING');
ALTER TABLE shop.order_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop.order_email_outbox FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON shop.order_email_outbox FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON shop.order_email_outbox FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shop_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON shop.order_email_outbox TO shop_runtime;
    CREATE POLICY order_email_runtime ON shop.order_email_outbox TO shop_runtime USING (true) WITH CHECK (true);
  END IF;
END $$;
