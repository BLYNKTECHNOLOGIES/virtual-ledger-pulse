
ALTER TABLE public.hr_payslips
  ALTER COLUMN payroll_run_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS razorpay_payslip_id TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS period_month DATE;

ALTER TABLE public.hr_payslips
  DROP CONSTRAINT IF EXISTS hr_payslips_source_check;
ALTER TABLE public.hr_payslips
  ADD CONSTRAINT hr_payslips_source_check
  CHECK (source IN ('native','razorpay_import'));

-- Guarantee one imported payslip per (employee, period) so re-runs are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS hr_payslips_rzp_import_unique
  ON public.hr_payslips (employee_id, period_month)
  WHERE source = 'razorpay_import';

-- Native rows must still be tied to a run.
ALTER TABLE public.hr_payslips
  DROP CONSTRAINT IF EXISTS hr_payslips_native_needs_run;
ALTER TABLE public.hr_payslips
  ADD CONSTRAINT hr_payslips_native_needs_run
  CHECK (source <> 'native' OR payroll_run_id IS NOT NULL);
