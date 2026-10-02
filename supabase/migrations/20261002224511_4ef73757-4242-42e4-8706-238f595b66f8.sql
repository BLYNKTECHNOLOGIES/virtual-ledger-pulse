-- Leave days count only working days (weekly offs and company holidays excluded)
CREATE OR REPLACE FUNCTION public.hr_leave_working_days(p_employee_id uuid, p_start date, p_end date, p_half boolean)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_start IS NULL THEN RETURN 0; END IF;
  IF COALESCE(p_half,false) THEN
    RETURN CASE WHEN public.fn_calculate_working_days(p_employee_id, p_start, p_start) > 0 THEN 0.5 ELSE 0 END;
  END IF;
  RETURN public.fn_calculate_working_days(p_employee_id, p_start, COALESCE(p_end, p_start));
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_leave_working_days(uuid,date,date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_working_days(uuid,date,date,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_enforce_half_day_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Automatic LOP absorptions are booked by payroll against days already absent; leave them as-is.
  IF COALESCE(NEW.source,'') = 'auto_lop_absorption' THEN
    IF NEW.is_half_day THEN NEW.total_days := 0.5; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.is_half_day IS DISTINCT FROM OLD.is_half_day
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    NEW.total_days := public.hr_leave_working_days(NEW.employee_id, NEW.start_date, NEW.end_date, NEW.is_half_day);
    IF TG_OP = 'INSERT' AND NEW.total_days <= 0 THEN
      RAISE EXCEPTION 'The selected dates fall only on weekly offs or holidays — no leave is needed for them';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Backfill: correct existing requests and re-book approved ones on working days only
DO $$
DECLARE r record; c record; v_new numeric; v_remaining numeric; v_taken numeric;
  v_code text; v_is_paid boolean; v_co uuid; v_cl uuid;
BEGIN
  SELECT id INTO v_co FROM public.hr_leave_types WHERE code='CO' AND is_active LIMIT 1;
  SELECT id INTO v_cl FROM public.hr_leave_types WHERE code='CL' AND is_active LIMIT 1;
  ALTER TABLE public.hr_leave_requests DISABLE TRIGGER USER;
  FOR r IN SELECT * FROM public.hr_leave_requests
           WHERE status NOT IN ('rejected','cancelled') AND COALESCE(source,'') <> 'auto_lop_absorption'
  LOOP
    v_new := public.hr_leave_working_days(r.employee_id, r.start_date, r.end_date, r.is_half_day);
    CONTINUE WHEN v_new = COALESCE(r.total_days,0);
    IF r.status <> 'approved' THEN
      UPDATE public.hr_leave_requests SET total_days = v_new WHERE id = r.id;
      CONTINUE;
    END IF;
    -- refund previous booking
    FOR c IN SELECT * FROM public.hr_leave_request_consumption WHERE request_id = r.id AND leave_type_id IS NOT NULL LOOP
      PERFORM public.hr_move_leave_balance(r.employee_id, c.leave_type_id, r.start_date, r.end_date, c.days, 1);
    END LOOP;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = r.id;
    -- re-book with the same cascade as approval
    SELECT code, is_paid INTO v_code, v_is_paid FROM public.hr_leave_types WHERE id = r.leave_type_id;
    v_remaining := v_new;
    IF v_code = 'LOP' OR COALESCE(v_is_paid,false) = false THEN
      IF v_remaining > 0 THEN
        INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
        VALUES (r.id, r.employee_id, NULL, v_remaining, 'unpaid');
      END IF;
    ELSE
      v_taken := public.hr_leave_take_from(r.employee_id, r.leave_type_id, r.start_date, r.end_date, v_remaining);
      IF v_taken > 0 THEN v_remaining := v_remaining - v_taken;
        INSERT INTO public.hr_leave_request_consumption VALUES (gen_random_uuid(), r.id, r.employee_id, r.leave_type_id, v_taken, 'assigned', now()); END IF;
      IF v_remaining > 0 AND v_co IS NOT NULL AND v_co <> r.leave_type_id THEN
        v_taken := public.hr_leave_take_from(r.employee_id, v_co, r.start_date, r.end_date, v_remaining);
        IF v_taken > 0 THEN v_remaining := v_remaining - v_taken;
          INSERT INTO public.hr_leave_request_consumption VALUES (gen_random_uuid(), r.id, r.employee_id, v_co, v_taken, 'compoff_fallback', now()); END IF;
      END IF;
      IF v_remaining > 0 AND v_cl IS NOT NULL AND v_cl <> r.leave_type_id THEN
        v_taken := public.hr_leave_take_from(r.employee_id, v_cl, r.start_date, r.end_date, v_remaining);
        IF v_taken > 0 THEN v_remaining := v_remaining - v_taken;
          INSERT INTO public.hr_leave_request_consumption VALUES (gen_random_uuid(), r.id, r.employee_id, v_cl, v_taken, 'casual_fallback', now()); END IF;
      END IF;
      IF v_remaining > 0 THEN
        INSERT INTO public.hr_leave_request_consumption VALUES (gen_random_uuid(), r.id, r.employee_id, NULL, v_remaining, 'unpaid', now());
      END IF;
    END IF;
    UPDATE public.hr_leave_requests
       SET total_days = v_new, unpaid_days = GREATEST(v_remaining,0), paid_days = GREATEST(v_new - GREATEST(v_remaining,0),0)
     WHERE id = r.id;
    INSERT INTO public.compliance_audit_log(action, table_name, record_id, before_data, after_data)
    VALUES ('leave_days_recounted_working_only','hr_leave_requests', r.id,
            jsonb_build_object('total_days', r.total_days), jsonb_build_object('total_days', v_new));
  END LOOP;
  ALTER TABLE public.hr_leave_requests ENABLE TRIGGER USER;
END $$;