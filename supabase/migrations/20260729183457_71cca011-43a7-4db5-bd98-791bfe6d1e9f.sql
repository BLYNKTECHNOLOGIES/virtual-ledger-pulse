
ALTER TABLE public.hr_probation_policy
  ADD COLUMN IF NOT EXISTS default_probation_days integer NOT NULL DEFAULT 90;

UPDATE public.hr_probation_policy SET default_probation_days = 90, updated_at = now();

CREATE OR REPLACE FUNCTION public.hr_probation_end_date(p_employee_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    wi.probation_end_date,
    (SELECT o.probation_end_date FROM public.hr_employee_onboarding o
      WHERE o.probation_end_date IS NOT NULL
        AND (o.employee_id::text = e.badge_id::text OR lower(o.email) = lower(e.email))
      ORDER BY o.created_at DESC LIMIT 1),
    (COALESCE(wi.joining_date, e.created_at::date)
       + (COALESCE((SELECT pp.default_probation_days FROM public.hr_probation_policy pp WHERE pp.id), 90) || ' days')::interval)::date
  )
  FROM public.hr_employees e
  LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
  WHERE e.id = p_employee_id;
$function$;

-- Re-base probation end dates that were auto-set as joining + 6 months to joining + 90 days
UPDATE public.hr_employee_work_info wi
SET probation_end_date = (wi.joining_date + interval '90 days')::date,
    updated_at = now()
WHERE wi.joining_date IS NOT NULL
  AND wi.probation_end_date = (wi.joining_date + interval '6 months')::date;
