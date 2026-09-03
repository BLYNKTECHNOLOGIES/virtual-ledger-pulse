CREATE OR REPLACE FUNCTION public.hr_leave_month_breakdown(
  p_employee_ids uuid[],
  p_period_month date
)
RETURNS TABLE(
  employee_id uuid,
  leave_breakdown jsonb,
  paid_leave_total numeric,
  unpaid_leave_total numeric,
  compoff_leave_total numeric,
  worked_off_days numeric,
  worked_off_dates date[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_default_pattern int[] := ARRAY[0];
  v_pat int[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT p.weekly_offs INTO v_pat
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true AND p.weekly_offs IS NOT NULL AND array_length(p.weekly_offs,1) > 0
  ORDER BY p.created_at NULLS LAST LIMIT 1;
  IF v_pat IS NOT NULL AND array_length(v_pat,1) > 0 THEN v_default_pattern := v_pat; END IF;

  RETURN QUERY
  WITH hols AS (
    SELECT h.date::date AS d FROM public.hr_holidays h
    WHERE h.is_active = true AND h.date BETWEEN v_start AND v_end
    UNION
    SELECT make_date(EXTRACT(YEAR FROM v_start)::int, EXTRACT(MONTH FROM h.date)::int, EXTRACT(DAY FROM h.date)::int)
    FROM public.hr_holidays h
    WHERE h.is_active = true AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_start)::int
      AND EXTRACT(DAY FROM h.date)::int <= EXTRACT(DAY FROM v_end)::int
  ),
  emp AS (
    SELECT e.id AS emp_id,
      COALESCE((SELECT p.weekly_offs FROM public.hr_employee_weekly_off eo
                JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
                WHERE eo.employee_id = e.id AND eo.is_current = true AND eo.effective_from <= v_end
                ORDER BY eo.effective_from DESC LIMIT 1), v_default_pattern) AS off_days
    FROM public.hr_employees e
    WHERE e.id = ANY(p_employee_ids)
  ),
  req AS (
    SELECT r.id, r.employee_id AS emp_id, r.start_date, r.end_date,
           GREATEST(1, (LEAST(r.end_date, v_end) - GREATEST(r.start_date, v_start) + 1))::numeric AS overlap_days,
           GREATEST(1, (r.end_date - r.start_date + 1))::numeric AS span_days
    FROM public.hr_leave_requests r
    WHERE r.employee_id = ANY(p_employee_ids)
      AND lower(coalesce(r.status,'')) = 'approved'
      AND r.start_date <= v_end AND r.end_date >= v_start
  ),
  cons AS (
    SELECT rq.emp_id,
           COALESCE(t.name, 'Unpaid leave') AS type_name,
           COALESCE(t.code, CASE WHEN c.source = 'unpaid' THEN 'LOP' ELSE '—' END) AS type_code,
           COALESCE(t.is_paid, false) AND c.source <> 'unpaid' AS is_paid,
           COALESCE(t.is_compensatory_leave, false) AS is_compoff,
           ROUND(SUM(c.days * (rq.overlap_days / rq.span_days))::numeric, 2) AS days
    FROM public.hr_leave_request_consumption c
    JOIN req rq ON rq.id = c.request_id
    LEFT JOIN public.hr_leave_types t ON t.id = c.leave_type_id
    GROUP BY 1,2,3,4,5
  ),
  restored AS (
    SELECT w.employee_id AS emp_id, COALESCE(SUM(w.days_restored),0)::numeric AS days
    FROM public.hr_leave_worked_days w
    WHERE w.employee_id = ANY(p_employee_ids)
      AND w.attendance_date BETWEEN v_start AND v_end
    GROUP BY 1
  ),
  evidence AS (
    SELECT x.emp_id, x.dt FROM (
      SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
      FROM public.hr_attendance_punches p
      WHERE p.employee_id = ANY(p_employee_ids)
        AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_start AND v_end
      GROUP BY 1,2
      UNION
      SELECT s.employee_id, s.attendance_date
      FROM public.hr_attendance_sessions s
      WHERE s.employee_id = ANY(p_employee_ids) AND s.attendance_date BETWEEN v_start AND v_end
      GROUP BY 1,2
    ) x
  ),
  worked_off AS (
    SELECT ev.emp_id,
           COUNT(*)::numeric AS days,
           array_agg(ev.dt ORDER BY ev.dt) AS dates
    FROM evidence ev
    JOIN emp em ON em.emp_id = ev.emp_id
    WHERE (EXTRACT(DOW FROM ev.dt)::int = ANY(em.off_days))
       OR EXISTS (SELECT 1 FROM hols h WHERE h.d = ev.dt)
    GROUP BY 1
  ),
  agg AS (
    SELECT c.emp_id,
      jsonb_agg(jsonb_build_object(
        'name', c.type_name, 'code', c.type_code,
        'is_paid', c.is_paid, 'is_compoff', c.is_compoff, 'days', c.days
      ) ORDER BY c.is_paid DESC, c.type_name) AS breakdown,
      SUM(CASE WHEN c.is_paid THEN c.days ELSE 0 END) AS paid_total,
      SUM(CASE WHEN c.is_paid THEN 0 ELSE c.days END) AS unpaid_total,
      SUM(CASE WHEN c.is_compoff THEN c.days ELSE 0 END) AS compoff_total
    FROM cons c GROUP BY 1
  )
  SELECT em.emp_id,
         COALESCE(a.breakdown, '[]'::jsonb),
         COALESCE(a.paid_total, 0),
         COALESCE(a.unpaid_total, 0),
         COALESCE(a.compoff_total, 0),
         COALESCE(w.days, 0),
         COALESCE(w.dates, ARRAY[]::date[])
  FROM emp em
  LEFT JOIN agg a ON a.emp_id = em.emp_id
  LEFT JOIN worked_off w ON w.emp_id = em.emp_id
  LEFT JOIN restored rs ON rs.emp_id = em.emp_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_leave_month_breakdown(uuid[], date) TO authenticated, service_role;