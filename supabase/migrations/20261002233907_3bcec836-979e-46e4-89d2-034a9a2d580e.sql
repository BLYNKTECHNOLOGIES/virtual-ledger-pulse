CREATE OR REPLACE FUNCTION public.hr_leave_take_from(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_want numeric)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_avail numeric := 0; v_take numeric := 0; v_future numeric := 0;
BEGIN
  IF p_leave_type_id IS NULL OR COALESCE(p_want,0) <= 0 THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(available_days),0) INTO v_avail
  FROM public.hr_leave_allocations a
  WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
    AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end);
  -- Balance as of the leave: credits accrued after the leave's last day were
  -- not yet earned and cannot fund it.
  SELECT COALESCE(SUM(l.accrued_days),0) INTO v_future
  FROM public.hr_leave_accrual_log l
  JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
  WHERE l.employee_id = p_employee_id AND p.leave_type_id = p_leave_type_id
    AND l.accrual_date > p_end
    AND EXISTS (SELECT 1 FROM public.hr_leave_allocations a
                WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
                  AND a.year = l.year AND a.quarter = l.quarter
                  AND public.hr_leave_alloc_in_scope(a.leave_type_id, a.quarter, a.year, p_start, p_end));
  v_avail := GREATEST(v_avail - v_future, 0);
  v_take := LEAST(GREATEST(p_want,0), v_avail);
  IF v_take > 0 THEN
    PERFORM public.hr_move_leave_balance(p_employee_id, p_leave_type_id, p_start, p_end, v_take, -1);
  END IF;
  RETURN v_take;
END $function$;