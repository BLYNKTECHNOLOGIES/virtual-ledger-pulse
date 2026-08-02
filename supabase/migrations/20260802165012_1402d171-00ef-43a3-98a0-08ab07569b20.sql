DROP POLICY IF EXISTS hr_payroll_input_additions_hr_all ON public.hr_payroll_input_additions;
CREATE POLICY hr_payroll_input_additions_hr_all
  ON public.hr_payroll_input_additions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
  );

DROP POLICY IF EXISTS hr_payroll_input_deductions_hr_all ON public.hr_payroll_input_deductions;
CREATE POLICY hr_payroll_input_deductions_hr_all
  ON public.hr_payroll_input_deductions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
  );