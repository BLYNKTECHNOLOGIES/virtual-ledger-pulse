
-- T-BUG-10: Schedule daily pricing effectiveness snapshot at 01:00 UTC
SELECT cron.schedule(
  'generate_pricing_effectiveness_snapshot',
  '0 1 * * *',
  'SELECT generate_pricing_effectiveness_snapshot(CURRENT_DATE - 1)'
);
