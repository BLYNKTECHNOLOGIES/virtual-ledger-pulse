ALTER TABLE public.hr_loans DROP CONSTRAINT IF EXISTS hr_loans_disbursement_mode_chk;
ALTER TABLE public.hr_loans ADD CONSTRAINT hr_loans_disbursement_mode_chk
  CHECK (disbursement_mode = ANY (ARRAY['outside_payroll'::text,'razorpay_advance'::text,'payroll_addition'::text]));
ALTER TABLE public.hr_loans ADD COLUMN IF NOT EXISTS payroll_addition_month date;
ALTER TABLE public.hr_loans ADD COLUMN IF NOT EXISTS payroll_addition_id uuid;