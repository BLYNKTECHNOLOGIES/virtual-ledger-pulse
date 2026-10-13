CREATE OR REPLACE FUNCTION public.hr_workforce_attrition_history(p_department uuid DEFAULT NULL, p_months int DEFAULT 12)
RETURNS TABLE(month_start date, month_end date, opening_hc int, closing_hc int, joiners int, exits int, attrition_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_this date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.hr_wf_is_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only HR staff can view attrition history';
  END IF;
  RETURN QUERY
  WITH emp AS (
    SELECT w.joining_date AS jd, coalesce(e.last_working_day, e.termination_date) AS xd
    FROM public.hr_employees e
    JOIN public.hr_employee_work_info w ON w.employee_id = e.id
    JOIN public.positions pos ON pos.id = w.job_position_id AND pos.is_active AND pos.in_workforce_planning
    WHERE (e.is_active OR coalesce(e.last_working_day, e.termination_date) IS NOT NULL)
      AND (p_department IS NULL OR w.department_id = p_department)
  ),
  m AS (
    SELECT g::date AS ms, (g + interval '1 month' - interval '1 day')::date AS me
    FROM generate_series(v_this - make_interval(months => greatest(p_months,1)), v_this - interval '1 month', interval '1 month') g
  ),
  c AS (
    SELECT m.ms, m.me,
      (SELECT count(*) FROM emp WHERE (jd IS NULL OR jd < m.ms) AND (xd IS NULL OR xd >= m.ms))::int o,
      (SELECT count(*) FROM emp WHERE (jd IS NULL OR jd <= m.me) AND (xd IS NULL OR xd > m.me))::int cl,
      (SELECT count(*) FROM emp WHERE jd BETWEEN m.ms AND m.me)::int j,
      (SELECT count(*) FROM emp WHERE xd BETWEEN m.ms AND m.me)::int x
    FROM m
  )
  SELECT c.ms, c.me, c.o, c.cl, c.j, c.x,
    CASE WHEN c.o + c.cl > 0 THEN round(c.x * 100.0 / ((c.o + c.cl) / 2.0), 2) ELSE 0 END
  FROM c ORDER BY c.ms;
END $$;