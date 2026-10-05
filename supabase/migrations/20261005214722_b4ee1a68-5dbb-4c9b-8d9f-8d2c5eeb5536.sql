CREATE OR REPLACE FUNCTION public.hr_leave_available(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_exclude_request uuid DEFAULT NULL::uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_avail numeric := 0; v_future numeric := 0; v_pending numeric := 0;
  v_code text; v_ms date; v_me date; v_earned numeric := 0; v_used numeric := 0;
BEGIN
  IF p_leave_type_id IS NULL THEN RETURN 0; END IF;
  SELECT code INTO v_code FROM public.hr_leave_types WHERE id = p_leave_type_id;

  -- Comp-off: only credits earned in the SAME calendar month as the leave.
  -- Unencashed credits from an earlier month are paid out by that month's payroll
  -- (processed in the first week of the next month) and must never also fund leave.
  IF v_code = 'CO' THEN
    v_ms := date_trunc('month', p_start)::date;
    v_me := (date_trunc('month', p_start) + interval '1 month - 1 day')::date;
    IF p_end > v_me THEN RETURN 0; END IF; -- comp-off leave cannot span months
    SELECT COALESCE(SUM(credit_days),0) INTO v_earned FROM public.hr_compoff_credits c
     WHERE c.employee_id = p_employee_id AND c.credit_date BETWEEN v_ms AND v_me
       AND (c.settled_period_month IS NULL OR c.settled_period_month = v_ms)
       AND COALESCE(c.settlement_outcome,'') <> 'voided_no_attendance_evidence';
    SELECT COALESCE(SUM(r.total_days),0) INTO v_used FROM public.hr_leave_requests r
     WHERE r.employee_id = p_employee_id AND r.leave_type_id = p_leave_type_id
       AND lower(COALESCE(r.status,'')) NOT IN ('rejected','cancelled')
       AND r.start_date BETWEEN v_ms AND v_me
       AND (p_exclude_request IS NULL OR r.id <> p_exclude_request);
    RETURN GREATEST(v_earned - v_used, 0);
  END IF;

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
END $function$;