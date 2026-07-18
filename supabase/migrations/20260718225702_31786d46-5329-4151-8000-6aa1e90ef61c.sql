
-- Extend enum with missing values (rest already exist)
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'attendance_edit_patch';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'attendance_fetch_range';

-- Extend hr_loans with Razorpay advance-salary tracking
ALTER TABLE public.hr_loans
  ADD COLUMN IF NOT EXISTS razorpay_advance_salary_id INT,
  ADD COLUMN IF NOT EXISTS razorpay_pushed_at TIMESTAMPTZ;

-- Promote statutory fields on hr_payslips
ALTER TABLE public.hr_payslips
  ADD COLUMN IF NOT EXISTS pf_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS esi_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS professional_tax NUMERIC(14,2);

-- Contractor payments table
CREATE TABLE IF NOT EXISTS public.hr_razorpay_contractor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_payment_id BIGINT UNIQUE,
  hr_employee_id UUID REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  employee_email TEXT,
  amount NUMERIC(14,2) NOT NULL,
  tax NUMERIC(14,2) DEFAULT 0,
  purpose TEXT,
  execute_on DATE,
  remarks TEXT,
  paid BOOLEAN NOT NULL DEFAULT false,
  status TEXT,
  raw_payload JSONB,
  last_synced_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_contractor_payments TO authenticated;
GRANT ALL ON public.hr_razorpay_contractor_payments TO service_role;

ALTER TABLE public.hr_razorpay_contractor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contractor payments"
  ON public.hr_razorpay_contractor_payments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "HR write contractor payments"
  ON public.hr_razorpay_contractor_payments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  );

CREATE INDEX IF NOT EXISTS idx_hr_rzp_contractor_payments_emp
  ON public.hr_razorpay_contractor_payments(hr_employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_rzp_contractor_payments_paid
  ON public.hr_razorpay_contractor_payments(paid);

DROP TRIGGER IF EXISTS trg_hr_rzp_contractor_payments_updated_at
  ON public.hr_razorpay_contractor_payments;
CREATE TRIGGER trg_hr_rzp_contractor_payments_updated_at
  BEFORE UPDATE ON public.hr_razorpay_contractor_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
