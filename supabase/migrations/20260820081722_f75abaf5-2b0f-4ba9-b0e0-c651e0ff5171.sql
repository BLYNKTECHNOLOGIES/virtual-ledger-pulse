DROP POLICY IF EXISTS "hr_salary_revisions_read" ON public.hr_salary_revisions;

CREATE POLICY "HR staff view salary revisions"
ON public.hr_salary_revisions
FOR SELECT TO authenticated
USING (public.hr_is_hr_staff(auth.uid()));