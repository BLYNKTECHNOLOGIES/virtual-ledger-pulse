DROP POLICY IF EXISTS "authenticated_all_hr_employee_bank_details" ON public.hr_employee_bank_details;

CREATE POLICY "HR staff manage employee bank details"
ON public.hr_employee_bank_details
FOR ALL TO authenticated
USING (public.hr_is_hr_staff(auth.uid()))
WITH CHECK (public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "Employees view own bank details"
ON public.hr_employee_bank_details
FOR SELECT TO authenticated
USING (employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid()));