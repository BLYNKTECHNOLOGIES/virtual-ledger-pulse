
CREATE OR REPLACE FUNCTION public.hr_leave_take_from(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_want numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_avail numeric := 0; v_take numeric := 0;
BEGIN
  IF p_leave_type_id IS NULL OR COALESCE(p_want,0) <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(available_days),0) INTO v_avail
  FROM public.hr_leave_allocations
  WHERE employee_id = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
    AND COALESCE(quarter,0) IN (0, CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int);

  v_take := LEAST(GREATEST(p_want,0), GREATEST(v_avail,0));
  IF v_take > 0 THEN
    PERFORM public.hr_move_leave_balance(p_employee_id, p_leave_type_id, p_start, p_end, v_take, -1);
  END IF;
  RETURN v_take;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_move_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_days numeric, p_sign integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_remaining numeric := COALESCE(p_days, 0);
  v_take numeric;
BEGIN
  IF v_remaining <= 0 THEN RETURN; END IF;

  IF p_sign > 0 THEN
    FOR r IN
      SELECT id, used_days FROM hr_leave_allocations
      WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
        AND year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
        AND COALESCE(quarter,0) IN (0, CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int)
      ORDER BY year, quarter
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(r.used_days, 0));
      IF v_take > 0 THEN
        UPDATE hr_leave_allocations
        SET available_days = available_days + v_take,
            used_days = GREATEST(used_days - v_take, 0),
            updated_at = now()
        WHERE id = r.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  ELSE
    FOR r IN
      SELECT id, available_days FROM hr_leave_allocations
      WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
        AND year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
        AND COALESCE(quarter,0) IN (0, CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int)
      ORDER BY year, quarter
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(r.available_days, 0));
      IF v_take > 0 THEN
        UPDATE hr_leave_allocations
        SET available_days = available_days - v_take,
            used_days = used_days + v_take,
            updated_at = now()
        WHERE id = r.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  END IF;
END $function$;
