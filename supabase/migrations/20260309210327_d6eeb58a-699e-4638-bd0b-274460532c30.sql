
-- Fix: All RPCs must accept p_user_id parameter because this app uses custom auth (auth.uid() is always NULL)
-- Also grant to anon role since the app uses the anon key

-- 1. Fix terminal_heartbeat to accept p_user_id
CREATE OR REPLACE FUNCTION public.terminal_heartbeat(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO terminal_user_presence (user_id, last_seen_at, is_online, updated_at)
  VALUES (p_user_id, now(), true, now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now(), is_online = true, updated_at = now();
END;
$$;

-- 2. Fix get_my_terminal_notifications to accept p_user_id
CREATE OR REPLACE FUNCTION public.get_my_terminal_notifications(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  message text,
  notification_type text,
  related_user_id uuid,
  is_read boolean,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT n.id, n.title, n.message, n.notification_type, n.related_user_id,
    n.is_read, n.is_active, n.created_at, n.updated_at
  FROM terminal_notifications n
  WHERE n.user_id = p_user_id
  AND n.is_active = true
  ORDER BY n.created_at DESC
  LIMIT 50;
$$;

-- 3. Fix mark_terminal_user_offline to accept p_user_id (already does, but re-ensure)
CREATE OR REPLACE FUNCTION public.mark_terminal_user_offline(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE terminal_user_presence
  SET is_online = false, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Grant all to both authenticated AND anon (custom auth uses anon key)
GRANT EXECUTE ON FUNCTION public.terminal_heartbeat(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_my_terminal_notifications(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.mark_terminal_user_offline(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_inactive_assignee_notification(uuid, text, text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resolve_inactive_assignee_notifications(uuid) TO authenticated, anon;

-- Also grant table access to anon role for the alert check queries
GRANT SELECT ON public.terminal_payer_assignments TO anon;
GRANT SELECT ON public.terminal_operator_assignments TO anon;
GRANT SELECT ON public.terminal_user_presence TO anon;
GRANT SELECT ON public.terminal_user_supervisor_mappings TO anon;
GRANT SELECT ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE ON public.terminal_user_presence TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_notifications TO anon;
