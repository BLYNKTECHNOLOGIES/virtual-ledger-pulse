
CREATE OR REPLACE VIEW public.hr_probation_status_v
WITH (security_invoker = true) AS
SELECT e.id AS employee_id,
       e.badge_id,
       public.hr_probation_end_date(e.id) AS probation_end_date,
       public.hr_is_on_probation(e.id) AS on_probation
FROM public.hr_employees e;

GRANT SELECT ON public.hr_probation_status_v TO authenticated;
