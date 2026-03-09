
-- Create a function to fetch notifications bypassing RLS (for debugging/reliability)
CREATE OR REPLACE FUNCTION public.get_my_terminal_notifications()
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
  WHERE n.user_id = auth.uid()
  AND n.is_active = true
  ORDER BY n.created_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_terminal_notifications TO authenticated;
