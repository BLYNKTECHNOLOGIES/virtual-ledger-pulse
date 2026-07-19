
ALTER TYPE public.hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'create_person';

CREATE OR REPLACE FUNCTION public.generate_employee_id(dept text, designation text DEFAULT 'Employee'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  dept_code text;
  year_suffix text;
  prefix text;
  sequence_num integer;
  new_employee_id text;
  max_hr integer;
  max_legacy integer;
BEGIN
  dept_code := CASE
    WHEN dept = 'Technology' THEN 'TECH'
    WHEN dept = 'Sales' THEN 'SALES'
    WHEN dept = 'Marketing' THEN 'MKT'
    WHEN dept = 'Human Resources' OR dept = 'HR' THEN 'HR'
    WHEN dept = 'Finance' THEN 'FIN'
    WHEN dept = 'Operations' THEN 'OPS'
    WHEN dept = 'Compliance' THEN 'COMP'
    WHEN dept = 'Legal' THEN 'LEGAL'
    ELSE 'EMP'
  END;

  year_suffix := RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::text, 2);
  prefix := dept_code || year_suffix;

  PERFORM pg_advisory_xact_lock(hashtext('generate_employee_id:' || prefix));

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(h.badge_id FROM (LENGTH(prefix) + 1)), '')::integer), 0)
    INTO max_hr
    FROM public.hr_employees h
   WHERE h.badge_id ~ ('^' || prefix || '[0-9]+$');

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(e.employee_id FROM (LENGTH(prefix) + 1)), '')::integer), 0)
    INTO max_legacy
    FROM public.employees e
   WHERE e.employee_id ~ ('^' || prefix || '[0-9]+$');

  sequence_num := GREATEST(max_hr, max_legacy) + 1;
  new_employee_id := prefix || LPAD(sequence_num::text, 3, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.hr_employees h WHERE h.badge_id = new_employee_id
    UNION ALL
    SELECT 1 FROM public.employees e WHERE e.employee_id = new_employee_id
  ) LOOP
    sequence_num := sequence_num + 1;
    new_employee_id := prefix || LPAD(sequence_num::text, 3, '0');
  END LOOP;

  RETURN new_employee_id;
END;
$function$;
