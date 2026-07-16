
DO $$
DECLARE v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'push_person','push_bank','push_salary','push_attendance','push_attendance_recall',
    'pull_payouts','pull_payslips','pull_taxdocs',
    'ledger_auto_match','ledger_signoff','ledger_reopen',
    'match','create_draft','apply_error','unlock_bulk','payroll_recall',
    'compute_payroll_run','dry_run_payroll_run','apply_payroll_pilot','apply_payroll_bulk',
    'lock_payroll_period','probe_payroll_run'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TYPE public.hr_razorpay_sync_action ADD VALUE IF NOT EXISTS %L', v);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;
