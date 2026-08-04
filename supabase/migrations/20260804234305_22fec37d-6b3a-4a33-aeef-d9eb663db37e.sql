CREATE OR REPLACE FUNCTION public.hr_sync_shift_schedule_from_work_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.hr_employee_shift_schedule%ROWTYPE;
BEGIN
  -- No schedule mutation is needed when the shift did not change.
  IF NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;

  -- Clearing the Work Information shift closes the active assignment cleanly.
  IF NEW.shift_id IS NULL THEN
    UPDATE public.hr_employee_shift_schedule
       SET is_current = false,
           effective_to = CASE
             WHEN effective_from < CURRENT_DATE THEN CURRENT_DATE - 1
             ELSE effective_from
           END
     WHERE employee_id = NEW.employee_id
       AND is_current = true;
    RETURN NEW;
  END IF;

  SELECT s.*
    INTO v_current
    FROM public.hr_employee_shift_schedule s
   WHERE s.employee_id = NEW.employee_id
     AND s.is_current = true
   ORDER BY s.effective_from DESC, s.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND AND v_current.shift_id = NEW.shift_id THEN
    RETURN NEW;
  END IF;

  IF FOUND AND v_current.effective_from >= CURRENT_DATE THEN
    -- Same-day corrections replace the current assignment rather than
    -- creating two inclusive date ranges for the same date.
    UPDATE public.hr_employee_shift_schedule
       SET shift_id = NEW.shift_id,
           effective_from = CURRENT_DATE,
           effective_to = NULL,
           is_current = true
     WHERE id = v_current.id;
  ELSE
    IF FOUND THEN
      UPDATE public.hr_employee_shift_schedule
         SET is_current = false,
             effective_to = CURRENT_DATE - 1
       WHERE id = v_current.id;
    END IF;

    INSERT INTO public.hr_employee_shift_schedule
      (employee_id, shift_id, effective_from, effective_to, is_current)
    VALUES
      (NEW.employee_id, NEW.shift_id, CURRENT_DATE, NULL, true);
  END IF;

  RETURN NEW;
END;
$$;