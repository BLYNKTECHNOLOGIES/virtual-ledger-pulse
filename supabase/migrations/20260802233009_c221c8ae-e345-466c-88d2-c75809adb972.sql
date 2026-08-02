-- 1) Backfill shift schedule rows from work info (source of truth used during onboarding/import)
INSERT INTO public.hr_employee_shift_schedule (employee_id, shift_id, effective_from, is_current)
SELECT wi.employee_id,
       wi.shift_id,
       COALESCE(wi.joining_date, CURRENT_DATE),
       true
FROM public.hr_employee_work_info wi
WHERE wi.shift_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_employee_shift_schedule s
    WHERE s.employee_id = wi.employee_id AND s.is_current
  );

-- 2) Keep the schedule in sync whenever work info shift changes
CREATE OR REPLACE FUNCTION public.hr_sync_shift_schedule_from_work_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hr_employee_shift_schedule s
    WHERE s.employee_id = NEW.employee_id AND s.is_current AND s.shift_id = NEW.shift_id
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.hr_employee_shift_schedule
     SET is_current = false,
         effective_to = COALESCE(effective_to, CURRENT_DATE)
   WHERE employee_id = NEW.employee_id AND is_current;

  INSERT INTO public.hr_employee_shift_schedule (employee_id, shift_id, effective_from, is_current)
  VALUES (NEW.employee_id, NEW.shift_id, CURRENT_DATE, true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_sync_shift_schedule ON public.hr_employee_work_info;
CREATE TRIGGER trg_hr_sync_shift_schedule
AFTER INSERT OR UPDATE OF shift_id ON public.hr_employee_work_info
FOR EACH ROW
EXECUTE FUNCTION public.hr_sync_shift_schedule_from_work_info();

-- 3) Weekly off for every remaining employee without one (including inactive/pending)
INSERT INTO public.hr_employee_weekly_off (employee_id, pattern_id, effective_from, is_current)
SELECT e.id,
       (SELECT p.id FROM public.hr_weekly_off_patterns p
        WHERE p.is_active
        ORDER BY (p.weekly_offs = ARRAY[0]) DESC, p.created_at ASC
        LIMIT 1),
       COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi WHERE wi.employee_id = e.id LIMIT 1), CURRENT_DATE),
       true
FROM public.hr_employees e
WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_employee_weekly_off w
    WHERE w.employee_id = e.id AND w.is_current
  )
  AND EXISTS (SELECT 1 FROM public.hr_weekly_off_patterns p WHERE p.is_active);