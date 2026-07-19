
-- O4: Fix ghost-endpoint hint on retired local payroll function
CREATE OR REPLACE FUNCTION public.fn_generate_payroll(p_payroll_run_id uuid, p_triggered_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Local payroll computation is retired. RazorpayX is the payroll authority.'
    USING ERRCODE = 'P0001',
          HINT = 'Payroll runs and execution live on the RazorpayX dashboard (https://x.razorpay.com/payroll). Use the HRMS "Payroll Inputs" page (/hrms/payroll/inputs) to stage additions, deductions, do-not-pay and reset-modifications, and use the "Salary Register Import" page for statutory CSV.';
END;
$$;

-- O7: Broaden RLS on payroll input staging tables to include HR Managers
DROP POLICY IF EXISTS hr_payroll_input_additions_admin_all ON public.hr_payroll_input_additions;
CREATE POLICY hr_payroll_input_additions_hr_all
  ON public.hr_payroll_input_additions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
  );

DROP POLICY IF EXISTS hr_payroll_input_deductions_admin_all ON public.hr_payroll_input_deductions;
CREATE POLICY hr_payroll_input_deductions_hr_all
  ON public.hr_payroll_input_deductions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
  );

-- Ensure grants (tables already exist; belt-and-braces)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_input_additions TO authenticated;
GRANT ALL ON public.hr_payroll_input_additions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_input_deductions TO authenticated;
GRANT ALL ON public.hr_payroll_input_deductions TO service_role;
