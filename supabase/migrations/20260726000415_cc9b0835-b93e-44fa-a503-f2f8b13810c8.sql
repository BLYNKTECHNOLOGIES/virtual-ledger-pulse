
-- =========================================================
-- Slice 1: unified payslip view
-- =========================================================
DROP VIEW IF EXISTS public.hr_payslips_v;

CREATE VIEW public.hr_payslips_v
WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.hr_employee_id AS employee_id,
  r.razorpay_employee_id,
  r.period_month,
  to_char(r.period_month, 'YYYY-MM') AS period_label,
  COALESCE(r.reg_gross_salary, r.gross_earnings) AS gross,
  COALESCE(r.reg_net_pay, r.net_pay)             AS net,
  r.tds_amount,
  r.total_deductions,
  r.pf_amount,
  r.esi_amount,
  r.professional_tax,
  r.reg_working_days AS working_days,
  r.pdf_url,
  r.pdf_storage_path,
  r.do_not_pay,
  r.employee_name_snapshot,
  'razorpay'::text AS source,
  r.pulled_at,
  r.created_at,
  r.updated_at
FROM public.hr_razorpay_payslip_records r;

GRANT SELECT ON public.hr_payslips_v TO authenticated, service_role;

COMMENT ON VIEW public.hr_payslips_v IS
  'Canonical payslip projection. RazorpayX is the source of truth; hr_payslips is deprecated. security_invoker=true so RLS on hr_razorpay_payslip_records applies.';

-- Orphan audit: legacy hr_payslips rows with no razorpay counterpart for that (employee, month).
CREATE OR REPLACE FUNCTION public.hr_payslip_link_orphans()
RETURNS TABLE(payslip_id uuid, employee_id uuid, period_month date, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.employee_id,
         COALESCE(p.period_month, p.created_at::date) AS period_month,
         'no_razorpay_record'::text
  FROM public.hr_payslips p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_razorpay_payslip_records r
    WHERE r.hr_employee_id = p.employee_id
      AND date_trunc('month', r.period_month) =
          date_trunc('month', COALESCE(p.period_month, p.created_at::date))
  );
$$;

GRANT EXECUTE ON FUNCTION public.hr_payslip_link_orphans() TO authenticated, service_role;

-- =========================================================
-- Slice 2: advance-salary metadata on hr_loans
-- =========================================================
ALTER TABLE public.hr_loans
  ADD COLUMN IF NOT EXISTS advance_type text
    NOT NULL DEFAULT 'loan'
    CHECK (advance_type IN ('loan','advance')),
  ADD COLUMN IF NOT EXISTS repayment_source text
    NOT NULL DEFAULT 'manual'
    CHECK (repayment_source IN ('salary_deduction','manual'));

-- Backfill: rows already flagged salary_advance become 'advance'
UPDATE public.hr_loans
SET advance_type = 'advance',
    repayment_source = 'salary_deduction'
WHERE loan_type = 'salary_advance'
  AND advance_type = 'loan';

-- Helper RPC: create the advance record (HR calls this; UI later invokes proxy push).
CREATE OR REPLACE FUNCTION public.hr_create_salary_advance(
  p_employee_id uuid,
  p_amount numeric,
  p_reason text,
  p_recover_from_month date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee is required';
  END IF;

  INSERT INTO public.hr_loans(
    employee_id, loan_type, advance_type, repayment_source,
    amount, outstanding_balance, emi_amount, tenure_months, interest_rate,
    disbursement_date, start_emi_date, status, reason
  )
  VALUES(
    p_employee_id, 'salary_advance', 'advance', 'salary_deduction',
    p_amount, p_amount, p_amount, 1, 0,
    CURRENT_DATE, COALESCE(p_recover_from_month, date_trunc('month', CURRENT_DATE)::date),
    'pending_push', p_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_create_salary_advance(uuid, numeric, text, date) TO authenticated, service_role;

-- =========================================================
-- Slice 6: sandbox toggle groundwork on hr_razorpay_settings
-- =========================================================
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS sandbox_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_base_url text,
  ADD COLUMN IF NOT EXISTS sandbox_revoke_after timestamptz;

COMMENT ON COLUMN public.hr_razorpay_settings.sandbox_mode IS
  'When true (and sandbox_revoke_after is in the future), the razorpay-payroll-proxy routes writes to sandbox_base_url instead of production. Auto-reverts after sandbox_revoke_after.';
