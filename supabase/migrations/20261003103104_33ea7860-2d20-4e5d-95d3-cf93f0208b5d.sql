CREATE OR REPLACE FUNCTION public.hr_leave_available(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_exclude_request uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_avail numeric := 0; v_future numeric := 0; v_pending numeric := 0;
BEGIN
  IF p_leave_type_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(available_days),0) INTO v_avail FROM public.hr_leave_allocations a
   WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
     AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end);
  SELECT COALESCE(SUM(l.accrued_days),0) INTO v_future
  FROM public.hr_leave_accrual_log l JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
  WHERE l.employee_id = p_employee_id AND p.leave_type_id = p_leave_type_id AND l.accrual_date > p_end
    AND EXISTS (SELECT 1 FROM public.hr_leave_allocations a WHERE a.employee_id = p_employee_id
      AND a.leave_type_id = p_leave_type_id AND a.year = l.year AND a.quarter = l.quarter
      AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end));
  SELECT COALESCE(SUM(total_days),0) INTO v_pending FROM public.hr_leave_requests r
   WHERE r.employee_id = p_employee_id AND r.leave_type_id = p_leave_type_id
     AND lower(COALESCE(r.status,'')) NOT IN ('approved','rejected','cancelled')
     AND (p_exclude_request IS NULL OR r.id <> p_exclude_request);
  RETURN GREATEST(v_avail - v_future - v_pending, 0);
END $$;
GRANT EXECUTE ON FUNCTION public.hr_leave_available(uuid,uuid,date,date,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_enforce_leave_balance_on_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_code text; v_name text; v_paid boolean; v_days numeric; v_avail numeric;
BEGIN
  IF COALESCE(NEW.source,'') = 'auto_lop_absorption' OR NEW.leave_type_id IS NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) IN ('rejected','cancelled') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) = 'approved' AND lower(NEW.status) = 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.leave_type_id IS NOT DISTINCT FROM OLD.leave_type_id
     AND NEW.start_date = OLD.start_date AND NEW.end_date = OLD.end_date
     AND NEW.total_days IS NOT DISTINCT FROM OLD.total_days
     AND NOT (lower(NEW.status) = 'approved' AND lower(COALESCE(OLD.status,'')) <> 'approved') THEN
    RETURN NEW;
  END IF;
  SELECT code, name, is_paid INTO v_code, v_name, v_paid FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_code = 'LOP' OR NOT COALESCE(v_paid,false) THEN RETURN NEW; END IF;
  v_days := CASE WHEN NEW.is_half_day THEN 0.5
                 ELSE public.fn_calculate_leave_days(NEW.employee_id, NEW.start_date, NEW.end_date, NEW.leave_type_id) END;
  v_avail := public.hr_leave_available(NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date, NEW.id);
  IF v_days > v_avail THEN
    RAISE EXCEPTION 'Not enough % balance: % day(s) available but % working day(s) selected. Apply only the available days as %, and the rest as Loss of Pay (shown as Absent and unpaid).',
      v_name, trim_scale(v_avail), trim_scale(v_days), v_name USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_leave_balance_on_apply ON public.hr_leave_requests;
CREATE TRIGGER trg_enforce_leave_balance_on_apply BEFORE INSERT OR UPDATE ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_leave_balance_on_apply();

CREATE OR REPLACE FUNCTION public.fn_leave_balance_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_remaining numeric; v_taken numeric; v_is_paid boolean; v_code text; v_name text; r record;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code, is_paid, name INTO v_code, v_is_paid, v_name FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = NEW.id;
    v_remaining := GREATEST(COALESCE(NEW.total_days,0), 0);
    IF v_code = 'LOP' OR COALESCE(v_is_paid, false) = false THEN
      NEW.paid_days := 0; NEW.unpaid_days := v_remaining;
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NULL, v_remaining, 'unpaid');
      RETURN NEW;
    END IF;
    v_taken := public.hr_leave_take_from(NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date, v_remaining);
    IF v_taken < v_remaining AND COALESCE(NEW.source,'') <> 'auto_lop_absorption' THEN
      RAISE EXCEPTION 'Not enough % balance to approve: % day(s) available, % requested. Reject it or change it to Loss of Pay.',
        v_name, trim_scale(v_taken), trim_scale(v_remaining);
    END IF;
    IF v_taken > 0 THEN
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NEW.leave_type_id, v_taken, 'assigned');
    END IF;
    v_remaining := v_remaining - v_taken;
    IF v_remaining > 0 THEN
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NULL, v_remaining, 'unpaid');
    END IF;
    NEW.unpaid_days := GREATEST(v_remaining, 0);
    NEW.paid_days := GREATEST(COALESCE(NEW.total_days,0) - NEW.unpaid_days, 0);
    RETURN NEW;
  END IF;
  IF NEW.status IN ('cancelled','rejected') AND OLD.status = 'approved' THEN
    FOR r IN SELECT * FROM public.hr_leave_request_consumption WHERE request_id = OLD.id AND leave_type_id IS NOT NULL LOOP
      PERFORM public.hr_move_leave_balance(OLD.employee_id, r.leave_type_id, OLD.start_date, OLD.end_date, r.days, 1);
    END LOOP;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = OLD.id;
    NEW.paid_days := 0; NEW.unpaid_days := 0;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_stamp_leave_attendance(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r RECORD; d date; v_pol RECORD; v_lop boolean; v_st text;
BEGIN
  SELECT * INTO r FROM public.hr_leave_requests WHERE id = p_request_id;
  IF r IS NULL OR r.start_date IS NULL OR r.end_date IS NULL THEN RETURN; END IF;
  SELECT (code = 'LOP' OR NOT is_paid) INTO v_lop FROM public.hr_leave_types WHERE id = r.leave_type_id;
  v_st := CASE WHEN COALESCE(v_lop,false) THEN 'absent' ELSE 'on_leave' END;
  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(r.employee_id);
  d := r.start_date;
  WHILE d <= r.end_date LOOP
    IF NOT (EXTRACT(DOW FROM d)::int = ANY(v_pol.off_days))
       AND (v_pol.holidays_working OR NOT EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.date = d AND h.is_active = true))
    THEN
      IF r.status = 'approved' THEN
        INSERT INTO public.hr_attendance_daily (employee_id, attendance_date, status, punch_count, session_count, total_hours, net_work_minutes, engine_version, flags)
        VALUES (r.employee_id, d, v_st, 0, 0, 0, 0, 'v4', jsonb_build_object('leave_request_id', r.id, 'auto_leave', true, 'lop_leave', COALESCE(v_lop,false)))
        ON CONFLICT (employee_id, attendance_date) DO UPDATE
          SET status = CASE
                WHEN public.hr_attendance_daily.manual_status IS NOT NULL
                  OR COALESCE(public.hr_attendance_daily.punch_count,0) > 0
                  OR public.hr_attendance_daily.first_in IS NOT NULL
                  OR COALESCE(public.hr_attendance_daily.net_work_minutes,0) > 0
                THEN public.hr_attendance_daily.status ELSE v_st END,
              flags = COALESCE(public.hr_attendance_daily.flags, '{}'::jsonb)
                      || jsonb_build_object('leave_request_id', r.id, 'auto_leave', true, 'lop_leave', COALESCE(v_lop,false)),
              updated_at = now();
      END IF;
    END IF;
    d := d + 1;
  END LOOP;
END $function$;