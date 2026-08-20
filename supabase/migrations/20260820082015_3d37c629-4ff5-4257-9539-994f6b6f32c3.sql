DROP POLICY IF EXISTS "hr_payslip_pay_head_lines_authenticated_all" ON public.hr_payslip_pay_head_lines;

CREATE POLICY "HR admins manage payslip lines"
ON public.hr_payslip_pay_head_lines
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super admin') OR has_role(auth.uid(), 'admin') OR public.hr_is_hr_staff(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'super admin') OR has_role(auth.uid(), 'admin') OR public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "Employees view own payslip lines"
ON public.hr_payslip_pay_head_lines
FOR SELECT TO authenticated
USING (hr_employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid()));