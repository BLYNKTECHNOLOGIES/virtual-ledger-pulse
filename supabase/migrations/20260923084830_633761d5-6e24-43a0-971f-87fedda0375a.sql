CREATE OR REPLACE FUNCTION public.hr_compoff_close_month(p_period_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_count integer;
  v_co_type uuid;
  v_year integer := extract(year from v_start)::integer;
  v_quarter integer := ceil(extract(month from v_start) / 3.0)::integer;
  v_now_start date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_now_year integer := extract(year from (now() AT TIME ZONE 'Asia/Kolkata'))::integer;
  v_now_quarter integer := ceil(extract(month from (now() AT TIME ZONE 'Asia/Kolkata')) / 3.0)::integer;
  v_emp uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.hr_is_hr_staff(auth.uid())
     AND NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT id INTO v_co_type FROM public.hr_leave_types WHERE code = 'CO' AND is_active LIMIT 1;

  UPDATE public.hr_compoff_credits c
  SET settled_period_month = v_start,
      settlement_outcome = COALESCE(c.settlement_outcome, 'settled_in_payroll')
  WHERE c.settled_period_month IS NULL
    AND c.credit_date BETWEEN v_start AND v_end;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_co_type IS NOT NULL THEN
    IF v_year = v_now_year AND v_quarter = v_now_quarter THEN
      -- The allocation row is quarter-grained, so the row for the month being
      -- closed is the SAME row that carries the CURRENT month's live comp-off
      -- balance. Never blanket-zero it: re-derive it from the ledger so only the
      -- settled (closed) month's credits drop out.
      FOR v_emp IN
        SELECT DISTINCT employee_id
        FROM public.hr_leave_allocations
        WHERE leave_type_id = v_co_type AND year = v_year AND quarter = v_quarter
      LOOP
        PERFORM public.hr_sync_compoff_allocation(v_emp);
      END LOOP;
    ELSE
      -- Fully past quarter: nothing unsettled can remain, expire the rows.
      UPDATE public.hr_leave_allocations
      SET allocated_days = 0,
          used_days = 0,
          carry_forward_days = 0,
          available_days = 0,
          expired_date = v_end,
          updated_at = now()
      WHERE leave_type_id = v_co_type
        AND year = v_year
        AND quarter = v_quarter;
    END IF;
  END IF;

  RETURN v_count;
END;
$function$;