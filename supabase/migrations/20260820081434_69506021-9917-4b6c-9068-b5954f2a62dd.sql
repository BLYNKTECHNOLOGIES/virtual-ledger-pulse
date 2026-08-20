DROP POLICY IF EXISTS "salary_structures_read_authenticated" ON public.hr_employee_salary_structures;

CREATE POLICY "HR staff read salary structures"
ON public.hr_employee_salary_structures
FOR SELECT
TO authenticated
USING (public.hr_is_hr_staff(auth.uid()));