-- Enable pg_cron and pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule weekly archive job (every Sunday at 2 AM UTC)
SELECT cron.schedule(
  'archive-old-attendance-data',
  '0 2 * * 0',
  $$SELECT public.archive_old_attendance_data()$$
);