ALTER TABLE public.hr_payroll_input_deductions
  ADD COLUMN IF NOT EXISTS recovery_kind text,
  ADD COLUMN IF NOT EXISTS recovery_ref_id uuid;

ALTER TABLE public.hr_payroll_input_deductions
  DROP CONSTRAINT IF EXISTS hr_payroll_input_deductions_recovery_kind_chk;
ALTER TABLE public.hr_payroll_input_deductions
  ADD CONSTRAINT hr_payroll_input_deductions_recovery_kind_chk
  CHECK (recovery_kind IS NULL OR recovery_kind = ANY (ARRAY['loan'::text,'deposit'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_input_deductions_recovery_uniq
  ON public.hr_payroll_input_deductions (recovery_kind, recovery_ref_id)
  WHERE recovery_ref_id IS NOT NULL;