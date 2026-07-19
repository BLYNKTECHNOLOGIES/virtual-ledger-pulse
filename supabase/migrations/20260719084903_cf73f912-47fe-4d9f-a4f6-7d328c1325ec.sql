
DROP FUNCTION IF EXISTS public.fn_generate_payroll(uuid, uuid);

CREATE FUNCTION public.fn_generate_payroll(p_payroll_run_id uuid, p_triggered_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'retired: RazorpayX is the payroll authority. HRMS no longer computes payroll locally. See docs/RAZORPAYX_COMMISSIONING.md.'
    USING ERRCODE = 'P0001',
          HINT = 'Use razorpay-payroll-proxy (payroll:run + payroll:execute) instead.';
END;
$$;

COMMENT ON FUNCTION public.fn_generate_payroll(uuid, uuid) IS
'RETIRED 2026-07-19. RazorpayX is the payroll calculation authority.';

ALTER TABLE public.hr_razorpay_payslip_records
  ADD COLUMN IF NOT EXISTS reg_basic numeric,
  ADD COLUMN IF NOT EXISTS reg_da numeric,
  ADD COLUMN IF NOT EXISTS reg_hra numeric,
  ADD COLUMN IF NOT EXISTS reg_sa numeric,
  ADD COLUMN IF NOT EXISTS reg_lta numeric,
  ADD COLUMN IF NOT EXISTS reg_pf_ee numeric,
  ADD COLUMN IF NOT EXISTS reg_pf_er numeric,
  ADD COLUMN IF NOT EXISTS reg_esi_ee numeric,
  ADD COLUMN IF NOT EXISTS reg_esi_er numeric,
  ADD COLUMN IF NOT EXISTS reg_pt numeric,
  ADD COLUMN IF NOT EXISTS reg_tds numeric,
  ADD COLUMN IF NOT EXISTS reg_advance_salary numeric,
  ADD COLUMN IF NOT EXISTS reg_loan_emi numeric,
  ADD COLUMN IF NOT EXISTS reg_one_time_payments numeric,
  ADD COLUMN IF NOT EXISTS reg_employer_esi_contr numeric,
  ADD COLUMN IF NOT EXISTS reg_employer_pf_contr numeric,
  ADD COLUMN IF NOT EXISTS reg_gross_salary numeric,
  ADD COLUMN IF NOT EXISTS reg_net_pay numeric,
  ADD COLUMN IF NOT EXISTS reg_working_days numeric,
  ADD COLUMN IF NOT EXISTS reg_source_filename text,
  ADD COLUMN IF NOT EXISTS reg_source_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reg_source_uploaded_by uuid;

COMMENT ON TABLE public.hr_razorpay_payslip_records IS
'RazorpayX output: payslip data pulled via view-payroll. Statutory splits (reg_*) come from the monthly dashboard CSV Salary Register uploader, which the API does not expose.';

CREATE TABLE IF NOT EXISTS public.hr_payroll_input_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  razorpay_employee_id text NOT NULL,
  period_month date NOT NULL,
  label text NOT NULL,
  amount numeric NOT NULL,
  addition_type smallint NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  pushed_at timestamptz,
  push_response jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (razorpay_employee_id, period_month, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_input_additions TO authenticated;
GRANT ALL ON public.hr_payroll_input_additions TO service_role;
ALTER TABLE public.hr_payroll_input_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_input_additions_admin_all" ON public.hr_payroll_input_additions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.hr_payroll_input_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  razorpay_employee_id text NOT NULL,
  period_month date NOT NULL,
  label text NOT NULL,
  amount numeric NOT NULL,
  pushed_at timestamptz,
  push_response jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (razorpay_employee_id, period_month, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_input_deductions TO authenticated;
GRANT ALL ON public.hr_payroll_input_deductions TO service_role;
ALTER TABLE public.hr_payroll_input_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_input_deductions_admin_all" ON public.hr_payroll_input_deductions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

COMMENT ON TABLE public.hr_payroll_input_additions IS 'RazorpayX input source: monthly additions staged before push via payroll:add-additions.';
COMMENT ON TABLE public.hr_payroll_input_deductions IS 'RazorpayX input source: monthly one-off deductions staged before push via payroll:add-deduction.';
