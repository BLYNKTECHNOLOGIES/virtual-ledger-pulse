-- Dedupe hr_employee_weekly_off: keep the newest row per employee, drop the rest.
WITH ranked AS (
  SELECT id, employee_id,
         ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY is_current DESC NULLS LAST, created_at DESC, id DESC) AS rn
  FROM public.hr_employee_weekly_off
)
DELETE FROM public.hr_employee_weekly_off w
USING ranked r
WHERE w.id = r.id AND r.rn > 1;

-- Ensure remaining row per employee is marked current.
UPDATE public.hr_employee_weekly_off SET is_current = TRUE WHERE is_current IS DISTINCT FROM TRUE;

-- Enforce one active weekly-off assignment per employee going forward.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_employee_weekly_off_one_per_employee
  ON public.hr_employee_weekly_off (employee_id);

-- Harden the auto-assign trigger so it never creates a second row for the same employee.
CREATE OR REPLACE FUNCTION public.hr_auto_assign_default_weekly_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.hr_employee_weekly_off WHERE employee_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_pattern_id
  FROM public.hr_weekly_off_patterns
  WHERE lower(name) LIKE '%sunday%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_pattern_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hr_employee_weekly_off (employee_id, pattern_id, effective_from, is_current)
  VALUES (NEW.id, v_pattern_id, CURRENT_DATE, TRUE)
  ON CONFLICT (employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;