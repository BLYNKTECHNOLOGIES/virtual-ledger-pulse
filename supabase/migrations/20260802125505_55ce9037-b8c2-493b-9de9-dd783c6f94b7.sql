ALTER TABLE public.hr_payroll_input_deductions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS lop_days numeric;

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_input_deductions_auto_lop_uniq
  ON public.hr_payroll_input_deductions (hr_employee_id, period_month)
  WHERE source = 'auto_lop';