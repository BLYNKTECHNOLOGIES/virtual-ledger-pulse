CREATE OR REPLACE VIEW public.hr_employee_completeness
WITH (security_invoker = on) AS
SELECT
  e.id AS employee_id,
  EXISTS (SELECT 1 FROM public.hr_employee_bank_details b WHERE b.employee_id = e.id AND b.account_number IS NOT NULL AND b.account_number <> '') AS has_bank,
  EXISTS (SELECT 1 FROM public.hr_employee_salary_structures s WHERE s.employee_id = e.id) AS has_salary,
  EXISTS (SELECT 1 FROM public.hr_employee_work_info w WHERE w.employee_id = e.id AND w.joining_date IS NOT NULL) AS has_doj,
  EXISTS (SELECT 1 FROM public.hr_employee_work_info w WHERE w.employee_id = e.id AND (w.department_id IS NOT NULL OR w.job_position_id IS NOT NULL)) AS has_designation
FROM public.hr_employees e
JOIN public.hr_employee_onboarding o ON o.employee_id = e.id
WHERE COALESCE(o.status, '') NOT IN ('completed', 'cancelled');

GRANT SELECT ON public.hr_employee_completeness TO authenticated;