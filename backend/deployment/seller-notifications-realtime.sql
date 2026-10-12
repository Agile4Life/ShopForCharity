-- Run with the Supabase schema owner. No shop table is exposed to the browser.
CREATE SCHEMA IF NOT EXISTS notifications_private;
REVOKE ALL ON SCHEMA notifications_private FROM PUBLIC;
GRANT USAGE ON SCHEMA notifications_private TO authenticated;

-- A narrow ownership lookup is needed because authenticated cannot read shop.
-- Authorization uses auth.uid() and current database roles, never user_metadata.
CREATE OR REPLACE FUNCTION notifications_private.can_receive(topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM shop.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.active AND p.role = 'SELLER'
      AND topic = 'seller:notifications:' || p.id::text
  );
$$;
REVOKE ALL ON FUNCTION notifications_private.can_receive(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notifications_private.can_receive(text) TO authenticated;

DROP POLICY IF EXISTS shop_seller_notifications_receive ON realtime.messages;
CREATE POLICY shop_seller_notifications_receive ON realtime.messages FOR SELECT TO authenticated
USING (extension = 'broadcast' AND notifications_private.can_receive((SELECT realtime.topic())));

-- Send only an ID after the transaction commits. Clients fetch notification
-- and order details through the API, which checks the current seller profile.
CREATE OR REPLACE FUNCTION notifications_private.publish_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM realtime.send(jsonb_build_object('notificationId', NEW.id), 'changed',
    'seller:notifications:' || NEW.recipient_profile_id::text, true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notifications_private.publish_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS seller_notification_broadcast ON shop.notifications;
CREATE TRIGGER seller_notification_broadcast AFTER INSERT OR UPDATE ON shop.notifications
FOR EACH ROW EXECUTE FUNCTION notifications_private.publish_change();
