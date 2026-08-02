CREATE OR REPLACE FUNCTION public.hr_auto_assign_default_weekly_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern_id uuid;
BEGIN
  -- Skip if the employee already has a current weekly-off assignment
  IF EXISTS (
    SELECT 1 FROM public.hr_employee_weekly_off w
    WHERE w.employee_id = NEW.id AND w.is_current
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_pattern_id
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active
  ORDER BY (p.weekly_offs = ARRAY[0]) DESC, p.created_at ASC
  LIMIT 1;

  IF v_pattern_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hr_employee_weekly_off (employee_id, pattern_id, effective_from, is_current)
  VALUES (
    NEW.id,
    v_pattern_id,
    COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi WHERE wi.employee_id = NEW.id LIMIT 1), CURRENT_DATE),
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_auto_assign_default_weekly_off ON public.hr_employees;
CREATE TRIGGER trg_hr_auto_assign_default_weekly_off
AFTER INSERT ON public.hr_employees
FOR EACH ROW
EXECUTE FUNCTION public.hr_auto_assign_default_weekly_off();

-- Backfill: active employees with no current weekly-off assignment
INSERT INTO public.hr_employee_weekly_off (employee_id, pattern_id, effective_from, is_current)
SELECT e.id,
       (SELECT p.id FROM public.hr_weekly_off_patterns p
        WHERE p.is_active
        ORDER BY (p.weekly_offs = ARRAY[0]) DESC, p.created_at ASC
        LIMIT 1),
       COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi WHERE wi.employee_id = e.id LIMIT 1), CURRENT_DATE),
       true
FROM public.hr_employees e
WHERE COALESCE(e.is_active, true)
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_employee_weekly_off w
    WHERE w.employee_id = e.id AND w.is_current
  )
  AND EXISTS (SELECT 1 FROM public.hr_weekly_off_patterns p WHERE p.is_active);