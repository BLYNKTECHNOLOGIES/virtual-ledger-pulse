CREATE OR REPLACE FUNCTION public.hr_leave_alloc_in_scope(p_type uuid, p_quarter int, p_year int, p_start date, p_end date)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT p_year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
     AND CASE WHEN (SELECT code FROM public.hr_leave_types WHERE id = p_type) = 'CO'
          THEN COALESCE(p_quarter,0) IN (0, CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int)
          ELSE COALESCE(p_quarter,0) <= CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int
        END
$$;

CREATE OR REPLACE FUNCTION public.hr_leave_take_from(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_want numeric)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_avail numeric := 0; v_take numeric := 0;
BEGIN
  IF p_leave_type_id IS NULL OR COALESCE(p_want,0) <= 0 THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(available_days),0) INTO v_avail
  FROM public.hr_leave_allocations a
  WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
    AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end);
  v_take := LEAST(GREATEST(p_want,0), GREATEST(v_avail,0));
  IF v_take > 0 THEN
    PERFORM public.hr_move_leave_balance(p_employee_id, p_leave_type_id, p_start, p_end, v_take, -1);
  END IF;
  RETURN v_take;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_move_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_days numeric, p_sign integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_remaining numeric := COALESCE(p_days, 0); v_take numeric;
BEGIN
  IF v_remaining <= 0 THEN RETURN; END IF;
  IF p_sign > 0 THEN
    FOR r IN SELECT id, used_days FROM hr_leave_allocations a
      WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
        AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end)
      ORDER BY year DESC, quarter DESC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(r.used_days, 0));
      IF v_take > 0 THEN
        UPDATE hr_leave_allocations SET available_days = available_days + v_take,
          used_days = GREATEST(used_days - v_take, 0), updated_at = now() WHERE id = r.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  ELSE
    -- oldest balance first
    FOR r IN SELECT id, available_days FROM hr_leave_allocations a
      WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
        AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end)
      ORDER BY year, CASE WHEN COALESCE(quarter,0)=0 THEN 99 ELSE quarter END
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(r.available_days, 0));
      IF v_take > 0 THEN
        UPDATE hr_leave_allocations SET available_days = available_days - v_take,
          used_days = used_days + v_take, updated_at = now() WHERE id = r.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  END IF;
END $function$;

-- Re-book affected approved requests (no status change => no notifications)
DO $$
DECLARE req record; c record; v_rem numeric; v_t numeric; v_co uuid; v_cl uuid;
BEGIN
  SELECT id INTO v_co FROM hr_leave_types WHERE code='CO' AND is_active LIMIT 1;
  SELECT id INTO v_cl FROM hr_leave_types WHERE code='CL' AND is_active LIMIT 1;
  FOR req IN SELECT * FROM hr_leave_requests WHERE id IN (
    '256c7818-abc9-454e-bd36-fd3b988196a9','0eb71534-dbd1-4192-bb90-e3e004b18c19')
    OR (status='approved' AND end_date >= '2026-10-01' AND unpaid_days > 0
        AND leave_type_id IN (SELECT id FROM hr_leave_types WHERE code IN ('CL','SL')))
    ORDER BY start_date
  LOOP
    FOR c IN SELECT * FROM hr_leave_request_consumption WHERE request_id=req.id AND leave_type_id IS NOT NULL LOOP
      PERFORM hr_move_leave_balance(req.employee_id, c.leave_type_id, req.start_date, req.end_date, c.days, 1);
    END LOOP;
    DELETE FROM hr_leave_request_consumption WHERE request_id=req.id;
    v_rem := req.total_days;
    v_t := hr_leave_take_from(req.employee_id, req.leave_type_id, req.start_date, req.end_date, v_rem);
    IF v_t>0 THEN v_rem:=v_rem-v_t; INSERT INTO hr_leave_request_consumption(request_id,employee_id,leave_type_id,days,source) VALUES(req.id,req.employee_id,req.leave_type_id,v_t,'assigned'); END IF;
    IF v_rem>0 AND v_co<>req.leave_type_id THEN v_t := hr_leave_take_from(req.employee_id, v_co, req.start_date, req.end_date, v_rem);
      IF v_t>0 THEN v_rem:=v_rem-v_t; INSERT INTO hr_leave_request_consumption VALUES(default,req.id,req.employee_id,v_co,v_t,'compoff_fallback',now()); END IF; END IF;
    IF v_rem>0 AND v_cl<>req.leave_type_id THEN v_t := hr_leave_take_from(req.employee_id, v_cl, req.start_date, req.end_date, v_rem);
      IF v_t>0 THEN v_rem:=v_rem-v_t; INSERT INTO hr_leave_request_consumption(request_id,employee_id,leave_type_id,days,source) VALUES(req.id,req.employee_id,v_cl,v_t,'casual_fallback'); END IF; END IF;
    IF v_rem>0 THEN INSERT INTO hr_leave_request_consumption(request_id,employee_id,leave_type_id,days,source) VALUES(req.id,req.employee_id,NULL,v_rem,'unpaid'); END IF;
    UPDATE hr_leave_requests SET unpaid_days=v_rem, paid_days=total_days-v_rem WHERE id=req.id;
  END LOOP;
END $$;