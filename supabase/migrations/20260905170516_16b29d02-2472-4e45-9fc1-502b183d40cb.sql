ALTER TABLE public.hr_loans
  ADD COLUMN IF NOT EXISTS disbursement_mode text NOT NULL DEFAULT 'outside_payroll';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_loans_disbursement_mode_chk'
  ) THEN
    ALTER TABLE public.hr_loans
      ADD CONSTRAINT hr_loans_disbursement_mode_chk
      CHECK (disbursement_mode IN ('outside_payroll','razorpay_advance'));
  END IF;
END $$;

COMMENT ON COLUMN public.hr_loans.disbursement_mode IS
  'outside_payroll = HRMS pays it off-cycle and stages the monthly EMI as a payroll deduction for HR to push. razorpay_advance = created through the RazorpayX Advance Salary API; RazorpayX disburses and recovers the EMI itself, so HRMS must NOT stage its own EMI deductions.';