DROP FUNCTION IF EXISTS public.resolve_inactive_assignee_notifications(uuid);

CREATE OR REPLACE FUNCTION public.resolve_inactive_assignee_notifications(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE terminal_notifications
  SET is_active = false, is_read = true, updated_at = now()
  WHERE related_user_id = p_user_id
    AND notification_type = 'inactive_assignee'
    AND is_active = true;
END;
$$;

UPDATE terminal_notifications n
SET is_active = false, is_read = true, updated_at = now()
WHERE n.notification_type = 'inactive_assignee'
  AND n.is_active = true
  AND (
    EXISTS (
      SELECT 1 FROM terminal_user_presence p
      WHERE p.user_id = n.related_user_id AND p.is_online = true
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM terminal_user_presence p
        WHERE p.user_id = n.related_user_id
      )
      AND n.created_at < now() - interval '2 hours'
    )
  );