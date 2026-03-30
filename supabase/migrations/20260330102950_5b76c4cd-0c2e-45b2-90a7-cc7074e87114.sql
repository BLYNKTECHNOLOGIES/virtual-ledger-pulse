
-- BUG-13: Must drop first because return type changed
DROP FUNCTION IF EXISTS public.get_my_terminal_notifications(uuid);

CREATE OR REPLACE FUNCTION public.get_my_terminal_notifications(p_user_id uuid)
RETURNS TABLE(id uuid, title text, message text, notification_type text, related_user_id uuid, is_read boolean, is_active boolean, created_at timestamptz, updated_at timestamptz, metadata jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE terminal_notifications n
  SET is_active = false, is_read = true, updated_at = now()
  WHERE n.user_id = p_user_id
    AND n.notification_type = 'inactive_assignee'
    AND n.is_active = true
    AND EXISTS (
      SELECT 1 FROM terminal_user_presence p
      WHERE p.user_id = n.related_user_id
        AND p.is_online = true
        AND p.last_seen_at > now() - interval '90 seconds'
    );

  RETURN QUERY
  SELECT n.id, n.title, n.message, n.notification_type, n.related_user_id,
    n.is_read, n.is_active, n.created_at, n.updated_at, n.metadata
  FROM terminal_notifications n
  WHERE n.user_id = p_user_id
  AND n.is_active = true
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;
