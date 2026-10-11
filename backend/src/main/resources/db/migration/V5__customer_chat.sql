CREATE TABLE shop.chat_conversations (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shop.shops(id),
  customer_id uuid NOT NULL REFERENCES shop.profiles(id),
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, customer_id)
);
CREATE TABLE shop.chat_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES shop.chat_conversations(id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK (sequence > 0),
  sender_id uuid NOT NULL REFERENCES shop.profiles(id),
  client_message_id uuid NOT NULL,
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 4000),
  product_id uuid REFERENCES shop.products(id) ON DELETE SET NULL,
  product_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sequence),
  UNIQUE (conversation_id, sender_id, client_message_id),
  CHECK (length(trim(content)) > 0 OR product_snapshot IS NOT NULL)
);
CREATE TABLE shop.chat_reads (
  conversation_id uuid NOT NULL REFERENCES shop.chat_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES shop.profiles(id) ON DELETE CASCADE,
  last_read_sequence bigint NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);
CREATE INDEX chat_conversations_updated ON shop.chat_conversations(shop_id, updated_at DESC, id);
CREATE INDEX chat_messages_sender ON shop.chat_messages(sender_id);
CREATE INDEX chat_messages_product ON shop.chat_messages(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX chat_reads_profile ON shop.chat_reads(profile_id);
ALTER TABLE shop.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.chat_reads ENABLE ROW LEVEL SECURITY;
-- These private tables are accessed by the existing trusted API role only.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shop_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON shop.chat_conversations, shop.chat_reads TO shop_runtime;
    GRANT SELECT, INSERT ON shop.chat_messages TO shop_runtime;
    CREATE POLICY chat_runtime ON shop.chat_conversations TO shop_runtime USING (true) WITH CHECK (true);
    CREATE POLICY chat_runtime ON shop.chat_messages TO shop_runtime USING (true) WITH CHECK (true);
    CREATE POLICY chat_runtime ON shop.chat_reads TO shop_runtime USING (true) WITH CHECK (true);
  END IF;
END $$;
