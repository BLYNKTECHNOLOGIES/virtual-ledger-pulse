CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid; v_pol RECORD; v_dow integer;
  v_is_weekly_off boolean := false; v_is_holiday boolean := false;
  v_credit_type text; v_reason text;
  v_status text := COALESCE(NEW.manual_status, NEW.status);
BEGIN
  -- HR day mark (calendar) wins over the engine status; regularized punches flow via status.
  IF v_status NOT IN ('present','late','half_day') AND NEW.status NOT IN ('present','late','half_day') THEN
    RETURN NEW;
  END IF;
  IF v_status NOT IN ('present','late','half_day') THEN v_status := NEW.status; END IF;

  IF EXISTS (SELECT 1 FROM public.hr_employee_work_info w
             WHERE w.employee_id = NEW.employee_id AND w.employee_type = 'contract') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(NEW.employee_id);
  IF v_pol.no_compoff THEN RETURN NEW; END IF;

  v_dow := extract(dow from NEW.attendance_date)::integer;
  v_is_weekly_off := v_dow = ANY(v_pol.off_days);
  IF NOT v_pol.holidays_working THEN
    SELECT EXISTS (SELECT 1 FROM public.hr_holidays h
                   WHERE h.date = NEW.attendance_date AND h.is_active = true) INTO v_is_holiday;
  END IF;
  IF NOT v_is_weekly_off AND NOT v_is_holiday THEN RETURN NEW; END IF;

  v_credit_type := CASE WHEN v_is_holiday THEN 'holiday' ELSE 'sunday_work' END;
  v_reason := CASE
    WHEN v_is_holiday AND v_is_weekly_off THEN 'Auto-granted: worked on company holiday and weekly-off day'
    WHEN v_is_holiday THEN 'Auto-granted: worked on company holiday'
    ELSE 'Auto-granted: worked on weekly-off day (' || to_char(NEW.attendance_date, 'Dy') || ', ' || v_status || ')'
  END;

  INSERT INTO public.hr_compoff_credits (employee_id, credit_date, credit_type, credit_days, is_allocated, notes)
  VALUES (NEW.employee_id, NEW.attendance_date, v_credit_type, 1, false, v_reason)
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (employee_id, attendance_date, attendance_status, outcome, reason, trigger_op, compoff_credit_id)
    VALUES (NEW.employee_id, NEW.attendance_date, v_status, 'granted', v_reason, TG_OP, v_inserted_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_grant_sunday_work_credit ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_grant_sunday_work_credit
AFTER INSERT OR UPDATE OF status, manual_status ON public.hr_attendance_daily
FOR EACH ROW EXECUTE FUNCTION public.hr_grant_sunday_work_credit();

CREATE OR REPLACE FUNCTION public.hr_reconcile_holiday_date(p_date date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cleared int := 0; v_credited int := 0;
BEGIN
  IF p_date IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

  UPDATE public.hr_attendance_daily d
     SET status = 'no_data',
         flags = COALESCE(d.flags, '{}'::jsonb) || jsonb_build_object('holiday_reclassified_at', now(), 'holiday_date', p_date)
   WHERE d.attendance_date = p_date AND d.status = 'absent' AND d.manual_status IS NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  DELETE FROM public.hr_attendance a
   WHERE a.attendance_date = p_date AND a.attendance_status = 'absent'
     AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_daily d
                     WHERE d.employee_id = a.employee_id AND d.attendance_date = p_date AND d.manual_status IS NOT NULL);

  INSERT INTO public.hr_compoff_credits (employee_id, credit_date, credit_type, credit_days, is_allocated, notes)
  SELECT d.employee_id, p_date, 'holiday', 1, false, 'Auto-granted: worked on company holiday'
    FROM public.hr_attendance_daily d
    CROSS JOIN LATERAL public.hr_employee_wo_policy(d.employee_id) pol
   WHERE d.attendance_date = p_date
     AND (COALESCE(d.manual_status, d.status) IN ('present','late','half_day') OR d.status IN ('present','late','half_day'))
     AND NOT pol.no_compoff AND NOT pol.holidays_working
     AND NOT EXISTS (SELECT 1 FROM public.hr_employee_work_info w
                     WHERE w.employee_id = d.employee_id AND w.employee_type = 'contract')
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING;
  GET DIAGNOSTICS v_credited = ROW_COUNT;

  RETURN jsonb_build_object('date', p_date, 'absent_cleared', v_cleared, 'compoff_credited', v_credited);
END;
$function$;