
-- =====================================================
-- Fix: Create SECURITY DEFINER functions for cross-user notification operations
-- The alert hook runs on one user's browser but creates/deactivates
-- notifications for OTHER users (ancestors in hierarchy)
-- =====================================================

-- Function to create inactive assignee notifications (bypasses RLS for cross-user insert)
CREATE OR REPLACE FUNCTION public.create_inactive_assignee_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_related_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if already exists
  IF EXISTS (
    SELECT 1 FROM terminal_notifications
    WHERE user_id = p_user_id
    AND related_user_id = p_related_user_id
    AND notification_type = 'inactive_assignee'
    AND is_active = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO terminal_notifications (user_id, title, message, notification_type, related_user_id, is_active, is_read)
  VALUES (p_user_id, p_title, p_message, 'inactive_assignee', p_related_user_id, true, false);
END;
$$;

-- Function to deactivate notifications when user comes back online
CREATE OR REPLACE FUNCTION public.resolve_inactive_assignee_notifications(p_related_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE terminal_notifications
  SET is_active = false, updated_at = now()
  WHERE related_user_id = p_related_user_id
  AND notification_type = 'inactive_assignee'
  AND is_active = true;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.create_inactive_assignee_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_inactive_assignee_notifications TO authenticated;
