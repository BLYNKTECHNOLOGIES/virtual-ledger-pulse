UPDATE public.hr_razorpay_sync_log
SET field_diff_summary = coalesce(field_diff_summary,'{}'::jsonb) || jsonb_build_object('payroll_month','2026-07','do_not_pay',true,'backfilled',true)
WHERE action = 'payroll_do_not_pay'
  AND error_text IS NULL
  AND created_at >= '2026-08-02'::date
  AND (field_diff_summary->>'payroll_month') IS NULL;