DO $$
BEGIN
  PERFORM cron.unschedule('razorpay-auto-sync-payslips-restore-once');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;