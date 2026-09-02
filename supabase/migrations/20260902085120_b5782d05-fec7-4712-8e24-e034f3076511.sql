
-- Two-way sync between hr_employee_work_info.shift_id and hr_employee_shift_schedule
CREATE OR REPLACE FUNCTION public.hr_sync_shift_from_work_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF current_setting('hr.shift_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT shift_id INTO v_current
  FROM hr_employee_shift_schedule
  WHERE employee_id = NEW.employee_id AND is_current
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_current IS NOT DISTINCT FROM NEW.shift_id THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('hr.shift_sync', 'on', true);

  DELETE FROM hr_employee_shift_schedule
  WHERE employee_id = NEW.employee_id AND effective_from >= v_today;

  UPDATE hr_employee_shift_schedule
  SET effective_to = v_today - 1, is_current = false
  WHERE employee_id = NEW.employee_id
    AND effective_from < v_today
    AND (effective_to IS NULL OR effective_to >= v_today);

  UPDATE hr_employee_shift_schedule
  SET is_current = false
  WHERE employee_id = NEW.employee_id AND is_current;

  INSERT INTO hr_employee_shift_schedule (employee_id, shift_id, effective_from, is_current)
  VALUES (NEW.employee_id, NEW.shift_id, v_today, true);

  PERFORM set_config('hr.shift_sync', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_sync_shift_from_work_info ON public.hr_employee_work_info;
CREATE TRIGGER trg_hr_sync_shift_from_work_info
AFTER INSERT OR UPDATE OF shift_id ON public.hr_employee_work_info
FOR EACH ROW EXECUTE FUNCTION public.hr_sync_shift_from_work_info();

CREATE OR REPLACE FUNCTION public.hr_sync_work_info_from_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('hr.shift_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE(NEW.is_current, false) OR NEW.shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('hr.shift_sync', 'on', true);

  UPDATE hr_employee_work_info
  SET shift_id = NEW.shift_id
  WHERE employee_id = NEW.employee_id
    AND shift_id IS DISTINCT FROM NEW.shift_id;

  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM hr_employee_work_info WHERE employee_id = NEW.employee_id
  ) THEN
    INSERT INTO hr_employee_work_info (employee_id, shift_id)
    VALUES (NEW.employee_id, NEW.shift_id);
  END IF;

  PERFORM set_config('hr.shift_sync', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_sync_work_info_from_shift ON public.hr_employee_shift_schedule;
CREATE TRIGGER trg_hr_sync_work_info_from_shift
AFTER INSERT OR UPDATE OF shift_id, is_current ON public.hr_employee_shift_schedule
FOR EACH ROW EXECUTE FUNCTION public.hr_sync_work_info_from_shift();
