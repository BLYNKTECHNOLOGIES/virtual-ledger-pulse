UPDATE terminal_notifications
SET is_active = false, is_read = true, updated_at = now()
WHERE notification_type = 'inactive_assignee'
  AND is_active = true
  AND related_user_id IN (
    SELECT user_id FROM terminal_user_presence WHERE is_online = true
  );