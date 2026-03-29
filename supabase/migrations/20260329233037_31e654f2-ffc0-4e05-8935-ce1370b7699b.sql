-- Migration 2: Register cron jobs for leave accrual and penalty calculation

-- Monthly leave accrual on 1st of every month at midnight
SELECT cron.schedule(
  'monthly-leave-accrual',
  '0 0 1 * *',
  $$SELECT run_leave_accrual()$$
);

-- Monthly penalty calculation on 1st of every month at 1 AM
-- Uses previous month (current_date - interval '1 month')
SELECT cron.schedule(
  'monthly-penalty-calc',
  '0 1 1 * *',
  $$SELECT fn_calculate_monthly_penalties(
    EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 month'))::integer,
    EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 month'))::integer
  )$$
);