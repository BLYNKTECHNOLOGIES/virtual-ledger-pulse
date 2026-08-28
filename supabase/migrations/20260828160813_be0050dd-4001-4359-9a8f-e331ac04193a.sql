ALTER TABLE public.hr_compoff_credits DROP CONSTRAINT IF EXISTS hr_compoff_credits_employee_id_credit_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS hr_compoff_credits_auto_uniq
  ON public.hr_compoff_credits (employee_id, credit_date)
  WHERE notes LIKE 'Auto-granted:%';

CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id uuid;
  v_off_dows integer[];
  v_dow integer;
  v_is_weekly_off boolean := false;
  v_is_holiday boolean := false;
  v_credit_type text;
  v_reason text;
BEGIN
  IF NEW.status NOT IN ('present', 'late', 'half_day') THEN
    RETURN NEW;
  END IF;

  v_dow := extract(dow from NEW.attendance_date)::integer;
  v_off_dows := public.fn_employee_weekly_off_dows(NEW.employee_id, NEW.attendance_date);
  v_is_weekly_off := v_off_dows IS NOT NULL AND v_dow = ANY(v_off_dows);

  SELECT EXISTS (
    SELECT 1 FROM public.hr_holidays h
    WHERE h.date = NEW.attendance_date AND h.is_active = true
  ) INTO v_is_holiday;

  IF NOT v_is_weekly_off AND NOT v_is_holiday THEN
    RETURN NEW;
  END IF;

  v_credit_type := CASE WHEN v_is_holiday THEN 'holiday' ELSE 'sunday_work' END;
  v_reason := CASE
    WHEN v_is_holiday AND v_is_weekly_off THEN 'Auto-granted: worked on company holiday and weekly-off day'
    WHEN v_is_holiday THEN 'Auto-granted: worked on company holiday'
    ELSE 'Auto-granted: worked on weekly-off day (' || to_char(NEW.attendance_date, 'Dy') || ', ' || NEW.status || ')'
  END;

  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, v_credit_type, 1, false, v_reason
  )
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'granted', v_reason, TG_OP, v_inserted_id
    );
  END IF;

  RETURN NEW;
END;
$$;