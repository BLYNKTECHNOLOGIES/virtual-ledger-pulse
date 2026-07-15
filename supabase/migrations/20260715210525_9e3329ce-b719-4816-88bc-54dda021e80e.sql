
-- 1) Fix generate_employee_id: correct source table + concurrency-safe
CREATE OR REPLACE FUNCTION public.generate_employee_id(dept text, designation text DEFAULT 'Employee')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept_code text;
  year_suffix text;
  prefix text;
  sequence_num integer;
  new_employee_id text;
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

  -- Serialize badge generation per-prefix so concurrent imports don't collide
  PERFORM pg_advisory_xact_lock(hashtext('generate_employee_id:' || prefix));

  SELECT COALESCE(MAX(
    NULLIF(SUBSTRING(h.badge_id FROM (LENGTH(prefix) + 1)), '')::integer
  ), 0) + 1
  INTO sequence_num
  FROM public.hr_employees h
  WHERE h.badge_id ~ ('^' || prefix || '[0-9]+$');

  new_employee_id := prefix || LPAD(sequence_num::text, 3, '0');

  WHILE EXISTS (SELECT 1 FROM public.hr_employees h WHERE h.badge_id = new_employee_id) LOOP
    sequence_num := sequence_num + 1;
    new_employee_id := prefix || LPAD(sequence_num::text, 3, '0');
  END LOOP;

  RETURN new_employee_id;
END;
$$;

-- 2) Renumber existing razorpay-imported drafts that got the `-XXXX` random suffix
WITH numbered AS (
  SELECT
    id,
    regexp_replace(badge_id, '-[A-Z0-9]{4}$', '') AS clean_base,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(badge_id, '-[A-Z0-9]{4}$', '')
      ORDER BY created_at, id
    ) AS rn
  FROM public.hr_employees
  WHERE additional_info->>'source' = 'razorpay_import'
    AND badge_id ~ '-[A-Z0-9]{4}$'
)
UPDATE public.hr_employees h
SET badge_id =
      substring(n.clean_base FROM 1 FOR length(n.clean_base) - 3)
   || LPAD(
        (substring(n.clean_base FROM length(n.clean_base) - 2 FOR 3)::int + n.rn)::text,
        3, '0'
      )
FROM numbered n
WHERE h.id = n.id;

-- 3) Backfill onboarding pipeline records for existing razorpay-imported drafts
INSERT INTO public.hr_employee_onboarding
  (first_name, last_name, email, phone, status, current_stage, employee_id, created_at, updated_at)
SELECT
  h.first_name,
  h.last_name,
  h.email,
  h.phone,
  'stage_1',
  1,
  h.id,
  now(),
  now()
FROM public.hr_employees h
WHERE h.additional_info->>'source' = 'razorpay_import'
  AND h.is_active = false
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_employee_onboarding o WHERE o.employee_id = h.id
  );

-- 4) Trigger: auto-create onboarding record for any future razorpay-imported draft
CREATE OR REPLACE FUNCTION public.autocreate_onboarding_for_razorpay_import()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.additional_info IS NOT NULL
     AND NEW.additional_info->>'source' = 'razorpay_import'
     AND COALESCE(NEW.is_active, false) = false
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_employee_onboarding WHERE employee_id = NEW.id
    ) THEN
      INSERT INTO public.hr_employee_onboarding
        (first_name, last_name, email, phone, status, current_stage, employee_id)
      VALUES
        (NEW.first_name, NEW.last_name, NEW.email, NEW.phone, 'stage_1', 1, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autocreate_onboarding_for_razorpay_import ON public.hr_employees;
CREATE TRIGGER trg_autocreate_onboarding_for_razorpay_import
AFTER INSERT ON public.hr_employees
FOR EACH ROW EXECUTE FUNCTION public.autocreate_onboarding_for_razorpay_import();
