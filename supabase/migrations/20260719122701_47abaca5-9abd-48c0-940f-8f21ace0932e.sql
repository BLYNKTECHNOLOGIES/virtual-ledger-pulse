
-- 1. Retire the legacy local engine
CREATE OR REPLACE FUNCTION public.fn_generate_payroll(p_payroll_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'fn_generate_payroll is retired. RazorpayX is the payroll authority; use the Shadow Calculator (Building) for local comparisons.';
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_due_scheduled_salary_revisions()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'apply_due_scheduled_salary_revisions is retired. Push salary revisions to RazorpayX and let the mirror refresh them.';
END;
$$;

-- 2. Shadow payroll namespace
CREATE TABLE IF NOT EXISTS public.hr_shadow_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  run_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'computed',
  computed_at timestamptz NOT NULL DEFAULT now(),
  total_employees integer NOT NULL DEFAULT 0,
  total_shadow_gross numeric NOT NULL DEFAULT 0,
  total_shadow_net numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_month, run_no)
);
GRANT SELECT ON public.hr_shadow_payroll_runs TO authenticated;
GRANT ALL ON public.hr_shadow_payroll_runs TO service_role;
ALTER TABLE public.hr_shadow_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR reads shadow runs"
  ON public.hr_shadow_payroll_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.hr_shadow_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.hr_shadow_payroll_runs(id) ON DELETE CASCADE,
  hr_employee_id uuid NOT NULL,
  period_month date NOT NULL,
  monthly_ctc numeric NOT NULL DEFAULT 0,
  monthly_gross numeric NOT NULL DEFAULT 0,
  earnings_total numeric NOT NULL DEFAULT 0,
  additions_total numeric NOT NULL DEFAULT 0,
  lop_days numeric NOT NULL DEFAULT 0,
  lop_amount numeric NOT NULL DEFAULT 0,
  pf_employee numeric NOT NULL DEFAULT 0,
  pf_employer numeric NOT NULL DEFAULT 0,
  esi_employee numeric NOT NULL DEFAULT 0,
  esi_employer numeric NOT NULL DEFAULT 0,
  pt_amount numeric NOT NULL DEFAULT 0,
  tds_amount numeric NOT NULL DEFAULT 0,
  deductions_total numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  razorpay_gross numeric,
  razorpay_net numeric,
  razorpay_pf numeric,
  razorpay_esi numeric,
  razorpay_pt numeric,
  razorpay_tds numeric,
  compute_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, hr_employee_id)
);
CREATE INDEX IF NOT EXISTS hr_shadow_lines_period_idx ON public.hr_shadow_payroll_lines(period_month, hr_employee_id);
GRANT SELECT ON public.hr_shadow_payroll_lines TO authenticated;
GRANT ALL ON public.hr_shadow_payroll_lines TO service_role;
ALTER TABLE public.hr_shadow_payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR reads shadow lines"
  ON public.hr_shadow_payroll_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.hr_shadow_component_breakdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.hr_shadow_payroll_lines(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  component_label text NOT NULL,
  component_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_shadow_component_line_idx ON public.hr_shadow_component_breakdown(line_id);
GRANT SELECT ON public.hr_shadow_component_breakdown TO authenticated;
GRANT ALL ON public.hr_shadow_component_breakdown TO service_role;
ALTER TABLE public.hr_shadow_component_breakdown ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR reads shadow components"
  ON public.hr_shadow_component_breakdown FOR SELECT
  TO authenticated
  USING (true);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_shadow_runs_updated') THEN
    CREATE TRIGGER trg_hr_shadow_runs_updated
      BEFORE UPDATE ON public.hr_shadow_payroll_runs
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_shadow_lines_updated') THEN
    CREATE TRIGGER trg_hr_shadow_lines_updated
      BEFORE UPDATE ON public.hr_shadow_payroll_lines
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 3. Bidirectional drift resolution
ALTER TABLE public.hr_drift_alerts
  ADD COLUMN IF NOT EXISTS resolution_direction text
    CHECK (resolution_direction IN ('update_hrms','push_to_razorpay','update_essl','dismissed'));

DROP VIEW IF EXISTS public.hr_drift_open;
CREATE VIEW public.hr_drift_open AS
  SELECT * FROM public.hr_drift_alerts WHERE resolved_at IS NULL;
GRANT SELECT ON public.hr_drift_open TO authenticated;
