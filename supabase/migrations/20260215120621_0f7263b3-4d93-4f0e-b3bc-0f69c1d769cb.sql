-- Fix hr_employees RLS to work with custom auth (anon key)
DROP POLICY IF EXISTS "Authenticated users can manage hr_employees" ON public.hr_employees;
CREATE POLICY "Allow all access to hr_employees" ON public.hr_employees FOR ALL USING (true) WITH CHECK (true);

-- Fix hr_employee_work_info RLS to work with custom auth (anon key)
DROP POLICY IF EXISTS "Authenticated users can manage hr_employee_work_info" ON public.hr_employee_work_info;
CREATE POLICY "Allow all access to hr_employee_work_info" ON public.hr_employee_work_info FOR ALL USING (true) WITH CHECK (true);