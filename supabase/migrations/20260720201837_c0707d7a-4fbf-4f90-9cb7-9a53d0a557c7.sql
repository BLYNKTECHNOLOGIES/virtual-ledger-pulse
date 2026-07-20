ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS probation_end_date DATE,
  ADD COLUMN IF NOT EXISTS tax_regime TEXT CHECK (tax_regime IN ('old','new'));