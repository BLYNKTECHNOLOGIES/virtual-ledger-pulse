
ALTER TABLE public.hr_shadow_payroll_runs
  ADD COLUMN IF NOT EXISTS input_completeness jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS readiness_tier text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN public.hr_shadow_payroll_runs.input_completeness IS
  'Snapshot of inputs available when this shadow run was computed. Shape: {active_employees, attendance_coverage_pct, register_imported, register_employee_count, inputs_staged_count, enrollment_resolved_pct}. Consumed by hr_drift_alerts to filter trustworthy vs. approximate results.';

COMMENT ON COLUMN public.hr_shadow_payroll_runs.readiness_tier IS
  'Derived at compute time from input_completeness: trustworthy | approximate | unusable. Downstream drift filters key off this.';
