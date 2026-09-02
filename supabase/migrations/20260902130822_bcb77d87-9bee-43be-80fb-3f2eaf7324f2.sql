CREATE OR REPLACE FUNCTION public.hr_employment_gap_working_days(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(employee_id uuid, month_working_days numeric, gap_working_days numeric, emp_from date, emp_to date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_default_pattern int[] := ARRAY[0];
  v_first_active_pattern int[];
BEGIN
  SELECT p.weekly_offs INTO v_first_active_pattern
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true AND p.weekly_offs IS NOT NULL AND array_length(p.weekly_offs, 1) > 0
  ORDER BY p.created_at NULLS LAST LIMIT 1;
  IF v_first_active_pattern IS NOT NULL AND array_length(v_first_active_pattern,1) > 0 THEN
    v_default_pattern := v_first_active_pattern;
  END IF;

  RETURN QUERY
  WITH hols AS (
    SELECT h.date::date AS d FROM public.hr_holidays h
    WHERE h.is_active = true AND h.date BETWEEN v_month_start AND v_month_end
    UNION
    SELECT make_date(EXTRACT(YEAR FROM v_month_start)::int, EXTRACT(MONTH FROM h.date)::int, EXTRACT(DAY FROM h.date)::int)
    FROM public.hr_holidays h
    WHERE h.is_active = true AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_month_start)::int
      AND EXTRACT(DAY FROM h.date)::int <= EXTRACT(DAY FROM v_month_end)::int
  ),
  emp_pat AS (
    SELECT e.id AS emp_id,
      COALESCE((SELECT p.weekly_offs FROM public.hr_employee_weekly_off eo
                JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
                WHERE eo.employee_id = e.id AND eo.is_current = true AND eo.effective_from <= v_month_end
                ORDER BY eo.effective_from DESC LIMIT 1), v_default_pattern) AS off_days,
      (SELECT wi.joining_date FROM public.hr_employee_work_info wi
        WHERE wi.employee_id = e.id ORDER BY wi.joining_date NULLS LAST LIMIT 1) AS doj,
      COALESCE(e.last_working_day, e.termination_date) AS lwd,
      public.hr_is_contractor(e.id) AS is_contractor
    FROM public.hr_employees e WHERE e.id = ANY(p_employee_ids)
  ),
  cal AS (
    SELECT ep.emp_id, d::date AS dt, ep.doj, ep.lwd, ep.is_contractor,
      CASE WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
           WHEN d::date IN (SELECT d FROM hols) THEN false
           ELSE true END AS is_working
    FROM emp_pat ep
    CROSS JOIN generate_series(v_month_start::timestamp, v_month_end::timestamp, interval '1 day') d
  )
  SELECT c.emp_id,
    COUNT(*) FILTER (WHERE c.is_working)::numeric,
    CASE WHEN bool_or(c.is_contractor) THEN 0::numeric
         ELSE COUNT(*) FILTER (
           WHERE c.is_working
             AND ((c.doj IS NOT NULL AND c.dt < c.doj) OR (c.lwd IS NOT NULL AND c.dt > c.lwd))
         )::numeric END,
    MAX(c.doj), MAX(c.lwd)
  FROM cal c
  GROUP BY c.emp_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_employment_gap_working_days(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_employment_gap_working_days(uuid[], date) TO service_role;