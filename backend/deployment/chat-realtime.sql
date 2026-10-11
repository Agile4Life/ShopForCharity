-- Supabase-specific transport. Application tables live in V5__customer_chat.sql.
CREATE SCHEMA IF NOT EXISTS chat_private;
REVOKE ALL ON SCHEMA chat_private FROM PUBLIC;
GRANT USAGE ON SCHEMA chat_private TO authenticated;

-- The Auth role has no access to shop. This narrow helper returns only whether
-- the current signed-in user may receive a topic; no user-provided user ID.
CREATE OR REPLACE FUNCTION chat_private.can_receive(topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM shop.profiles p WHERE p.auth_user_id=auth.uid() AND p.active AND (
      (topic='chat:inbox:sellers' AND p.role='SELLER') OR
      (topic='chat:inbox:' || p.auth_user_id::text AND p.role='CUSTOMER') OR
      EXISTS (SELECT 1 FROM shop.chat_conversations c
        WHERE topic='chat:room:' || c.id::text
          AND (p.role='SELLER' OR (p.role='CUSTOMER' AND c.customer_id=p.id)))
    )
  );
$$;
REVOKE ALL ON FUNCTION chat_private.can_receive(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION chat_private.can_receive(text) TO authenticated;
DROP POLICY IF EXISTS shop_chat_receive ON realtime.messages;
CREATE POLICY shop_chat_receive ON realtime.messages FOR SELECT TO authenticated
USING (extension='broadcast' AND chat_private.can_receive((SELECT realtime.topic())));

-- Publish only identifiers. Every client must fetch content through the API,
-- which checks current account/membership state even after role revocation.
CREATE OR REPLACE FUNCTION chat_private.publish_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE customer_auth uuid; payload jsonb;
BEGIN
  SELECT p.auth_user_id INTO customer_auth FROM shop.chat_conversations c
    JOIN shop.profiles p ON p.id=c.customer_id WHERE c.id=NEW.conversation_id;
  payload := jsonb_build_object('conversationId',NEW.conversation_id);
  PERFORM realtime.send(payload,'changed','chat:room:' || NEW.conversation_id::text,true);
  PERFORM realtime.send(payload,'changed','chat:inbox:sellers',true);
  PERFORM realtime.send(payload,'changed','chat:inbox:' || customer_auth::text,true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION chat_private.publish_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS chat_message_broadcast ON shop.chat_messages;
CREATE TRIGGER chat_message_broadcast AFTER INSERT ON shop.chat_messages
FOR EACH ROW EXECUTE FUNCTION chat_private.publish_change();
DROP TRIGGER IF EXISTS chat_read_broadcast ON shop.chat_reads;
CREATE TRIGGER chat_read_broadcast AFTER INSERT OR UPDATE ON shop.chat_reads
FOR EACH ROW EXECUTE FUNCTION chat_private.publish_change();
