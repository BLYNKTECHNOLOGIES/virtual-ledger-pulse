-- P22-MAINT-01: Add 90-day cleanup cron for email logs
SELECT cron.schedule(
  'cleanup-old-email-logs',
  '30 2 * * *',
  $$DELETE FROM email_send_log WHERE created_at < now() - interval '90 days';
    DELETE FROM hr_email_send_log WHERE created_at < now() - interval '90 days';$$
);