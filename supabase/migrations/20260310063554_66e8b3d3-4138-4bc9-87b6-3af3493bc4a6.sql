-- Clean up remaining stale notifications for users that are currently online
UPDATE terminal_notifications n
SET is_active = false, is_read = true, updated_at = now()
WHERE n.notification_type = 'inactive_assignee'
  AND n.is_active = true
  AND EXISTS (
    SELECT 1 FROM terminal_user_presence p
    WHERE p.user_id = n.related_user_id
      AND p.is_online = true
  );