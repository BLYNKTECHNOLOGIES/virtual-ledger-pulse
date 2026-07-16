
DO $$ BEGIN
  CREATE TYPE public.hr_razorpay_payroll_run_status AS ENUM (
    'draft','computed','dry_run_ok','pilot_applied','bulk_applied','locked','recalled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hr_razorpay_payroll_line_status AS ENUM (
    'draft','dry_run_ok','applied','failed','skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.hr_razorpay_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month DATE NOT NULL,
  status public.hr_razorpay_payroll_run_status NOT NULL DEFAULT 'draft',
  totals_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
  totals_deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
  totals_net NUMERIC(18,2) NOT NULL DEFAULT 0,
  headcount_included INT NOT NULL DEFAULT 0,
  headcount_skipped INT NOT NULL DEFAULT 0,
  envelope_verified BOOLEAN NOT NULL DEFAULT false,
  envelope_verified_by UUID,
  envelope_verified_at TIMESTAMPTZ,
  dry_run_response JSONB,
  apply_response JSONB,
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  recall_reason TEXT,
  recalled_by UUID,
  recalled_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_razorpay_payroll_runs_period_month_first_of_month
    CHECK (EXTRACT(DAY FROM period_month) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_razorpay_payroll_runs_period_uk
  ON public.hr_razorpay_payroll_runs (period_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_payroll_runs TO authenticated;
GRANT ALL ON public.hr_razorpay_payroll_runs TO service_role;
ALTER TABLE public.hr_razorpay_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "razorpay_payroll_runs_all"
ON public.hr_razorpay_payroll_runs
FOR ALL TO authenticated
USING (user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR has_role(auth.uid(), 'Super Admin'::text))
WITH CHECK (user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR has_role(auth.uid(), 'Super Admin'::text));

CREATE TABLE IF NOT EXISTS public.hr_razorpay_payroll_run_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.hr_razorpay_payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  gross_earnings NUMERIC(18,2) NOT NULL DEFAULT 0,
  lop_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
  loan_emi NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
  skip_label TEXT,
  source_snapshot JSONB,
  push_status public.hr_razorpay_payroll_line_status NOT NULL DEFAULT 'draft',
  push_response JSONB,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_razorpay_payroll_run_lines_uk UNIQUE (run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS hr_razorpay_payroll_run_lines_run_idx
  ON public.hr_razorpay_payroll_run_lines (run_id);
CREATE INDEX IF NOT EXISTS hr_razorpay_payroll_run_lines_emp_idx
  ON public.hr_razorpay_payroll_run_lines (employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_payroll_run_lines TO authenticated;
GRANT ALL ON public.hr_razorpay_payroll_run_lines TO service_role;
ALTER TABLE public.hr_razorpay_payroll_run_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "razorpay_payroll_run_lines_all"
ON public.hr_razorpay_payroll_run_lines
FOR ALL TO authenticated
USING (user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR has_role(auth.uid(), 'Super Admin'::text))
WITH CHECK (user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR has_role(auth.uid(), 'Super Admin'::text));

CREATE TABLE IF NOT EXISTS public.hr_razorpay_payroll_run_one_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.hr_razorpay_payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bonus','reimbursement','deduction')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_razorpay_payroll_run_one_offs_run_idx
  ON public.hr_razorpay_payroll_run_one_offs (run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_payroll_run_one_offs TO authenticated;
GRANT ALL ON public.hr_razorpay_payroll_run_one_offs TO service_role;
ALTER TABLE public.hr_razorpay_payroll_run_one_offs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "razorpay_payroll_run_one_offs_all"
ON public.hr_razorpay_payroll_run_one_offs
FOR ALL TO authenticated
USING (user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR has_role(auth.uid(), 'Super Admin'::text))
WITH CHECK (user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR has_role(auth.uid(), 'Super Admin'::text));

ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS push_payroll_envelope_key TEXT,
  ADD COLUMN IF NOT EXISTS push_payroll_endpoint_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_payroll_envelope_verified_by UUID,
  ADD COLUMN IF NOT EXISTS push_payroll_envelope_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_payroll_pilot_unlocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_payroll_bulk_unlocked BOOLEAN NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS trg_hr_razorpay_payroll_runs_updated_at ON public.hr_razorpay_payroll_runs;
CREATE TRIGGER trg_hr_razorpay_payroll_runs_updated_at
BEFORE UPDATE ON public.hr_razorpay_payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hr_razorpay_payroll_run_lines_updated_at ON public.hr_razorpay_payroll_run_lines;
CREATE TRIGGER trg_hr_razorpay_payroll_run_lines_updated_at
BEFORE UPDATE ON public.hr_razorpay_payroll_run_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
