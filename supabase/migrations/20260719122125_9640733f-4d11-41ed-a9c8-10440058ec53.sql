-- ============================================================
-- STAGE 1: Retire the legacy local payroll calculator entirely
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_generate_payroll(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.apply_due_scheduled_salary_revisions() CASCADE;

-- Remove any cron job that used to invoke the scheduled revision applier.
DO $$
DECLARE
  j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN
      SELECT jobid FROM cron.job
      WHERE command ILIKE '%apply-scheduled-salary-revisions%'
         OR command ILIKE '%apply_due_scheduled_salary_revisions%'
    LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
END $$;

-- ============================================================
-- STAGE 2: Shadow payroll engine — fully isolated namespace
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hr_shadow_payroll_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month date NOT NULL, -- first day of the month
  run_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','computed','archived')),
  notes text,
  computed_at timestamptz,
  computed_by uuid,
  total_employees integer NOT NULL DEFAULT 0,
  total_shadow_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_shadow_net numeric(14,2) NOT NULL DEFAULT 0,
  total_razorpay_gross numeric(14,2),
  total_razorpay_net numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month, run_no)
);
GRANT SELECT ON public.hr_shadow_payroll_runs TO authenticated;
GRANT ALL ON public.hr_shadow_payroll_runs TO service_role;
ALTER TABLE public.hr_shadow_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read shadow runs" ON public.hr_shadow_payroll_runs
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.hr_shadow_payroll_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.hr_shadow_payroll_runs(id) ON DELETE CASCADE,
  hr_employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  monthly_ctc numeric(12,2) NOT NULL DEFAULT 0,
  monthly_gross numeric(12,2) NOT NULL DEFAULT 0,
  earnings_total numeric(12,2) NOT NULL DEFAULT 0,
  additions_total numeric(12,2) NOT NULL DEFAULT 0,
  lop_days numeric(6,2) NOT NULL DEFAULT 0,
  lop_amount numeric(12,2) NOT NULL DEFAULT 0,
  pf_employee numeric(12,2) NOT NULL DEFAULT 0,
  pf_employer numeric(12,2) NOT NULL DEFAULT 0,
  esi_employee numeric(12,2) NOT NULL DEFAULT 0,
  esi_employer numeric(12,2) NOT NULL DEFAULT 0,
  pt_amount numeric(12,2) NOT NULL DEFAULT 0,
  tds_amount numeric(12,2) NOT NULL DEFAULT 0,
  deductions_total numeric(12,2) NOT NULL DEFAULT 0,
  net_pay numeric(12,2) NOT NULL DEFAULT 0,
  -- Razorpay comparison snapshot (nullable — filled by comparator)
  razorpay_gross numeric(12,2),
  razorpay_net numeric(12,2),
  razorpay_pf numeric(12,2),
  razorpay_esi numeric(12,2),
  razorpay_pt numeric(12,2),
  razorpay_tds numeric(12,2),
  diff_summary jsonb,
  compute_notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, hr_employee_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_shadow_lines_emp ON public.hr_shadow_payroll_lines (hr_employee_id, period_month);
GRANT SELECT ON public.hr_shadow_payroll_lines TO authenticated;
GRANT ALL ON public.hr_shadow_payroll_lines TO service_role;
ALTER TABLE public.hr_shadow_payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read shadow lines" ON public.hr_shadow_payroll_lines
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.hr_shadow_component_breakdown (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_id uuid NOT NULL REFERENCES public.hr_shadow_payroll_lines(id) ON DELETE CASCADE,
  component_key text NOT NULL,   -- basic, hra, special_allowance, lta, ot, bonus, arrears, reimbursement, ...
  component_label text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('earning','deduction','employer_contribution','info')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  formula_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_shadow_comp_line ON public.hr_shadow_component_breakdown (line_id);
GRANT SELECT ON public.hr_shadow_component_breakdown TO authenticated;
GRANT ALL ON public.hr_shadow_component_breakdown TO service_role;
ALTER TABLE public.hr_shadow_component_breakdown ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read shadow components" ON public.hr_shadow_component_breakdown
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_hr_shadow_runs_updated_at
  BEFORE UPDATE ON public.hr_shadow_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_shadow_lines_updated_at
  BEFORE UPDATE ON public.hr_shadow_payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STAGE 3: Drift ledger — resolution direction + audit view
-- ============================================================
ALTER TABLE public.hr_drift_alerts
  ADD COLUMN IF NOT EXISTS resolution_direction text
    CHECK (resolution_direction IN ('hrms_wins','razorpay_wins','essl_wins','ignored'));

CREATE INDEX IF NOT EXISTS idx_hr_drift_resolved
  ON public.hr_drift_alerts (resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

-- Rebuild the open-drifts view so the new column is available downstream.
DROP VIEW IF EXISTS public.hr_drift_open;
CREATE VIEW public.hr_drift_open
WITH (security_invoker=on) AS
SELECT d.*,
       e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name,
       e.badge_id,
       e.is_active
FROM public.hr_drift_alerts d
JOIN public.hr_employees e ON e.id = d.hr_employee_id
WHERE d.resolved_at IS NULL;