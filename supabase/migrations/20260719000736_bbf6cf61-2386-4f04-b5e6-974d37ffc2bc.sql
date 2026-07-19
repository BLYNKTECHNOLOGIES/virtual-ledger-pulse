SELECT
  (SELECT count(*) FROM public.hr_razorpay_payslip_records) AS razorpay_records,
  (SELECT count(*) FROM public.hr_payslips WHERE source='razorpay_import') AS reflected_payslips,
  (SELECT jobid FROM cron.job WHERE jobname='razorpay-auto-sync-payslips-daily') AS daily_job_id;