CREATE OR REPLACE FUNCTION public.hr_lop_days(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, incomplete_held_days numeric, absent_days numeric, half_days numeric, lop_days numeric, formula text, weekly_off_days integer[], weekly_off_source text, config_errors text[])
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
  SELECT ARRAY(SELECT jsonb_array_elements_text(p.weekly_offs)::int)
  INTO v_first_active_pattern
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true
    AND jsonb_typeof(p.weekly_offs) = 'array'
    AND jsonb_array_length(p.weekly_offs) > 0
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;
  IF v_first_active_pattern IS NOT NULL AND array_length(v_first_active_pattern,1) > 0 THEN
    v_default_pattern := v_first_active_pattern;
  END IF;

  RETURN QUERY
  WITH
  policy AS (
    SELECT
      COALESCE((SELECT ap.late_count_for_lop  FROM public.hr_attendance_policies ap WHERE ap.is_active = true AND ap.is_default = true LIMIT 1), 0) AS late_threshold,
      COALESCE((SELECT ap.half_day_count_for_lop FROM public.hr_attendance_policies ap WHERE ap.is_active = true AND ap.is_default = true LIMIT 1), 0) AS half_day_threshold
  ),
  hols AS (
    SELECT h.date::date AS d
    FROM public.hr_holidays h
    WHERE h.is_active = true
      AND h.date BETWEEN v_month_start AND v_month_end
    UNION
    SELECT make_date(
             EXTRACT(YEAR FROM v_month_start)::int,
             EXTRACT(MONTH FROM h.date)::int,
             EXTRACT(DAY FROM h.date)::int
           )
    FROM public.hr_holidays h
    WHERE h.is_active = true
      AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_month_start)::int
  ),
  emp_pat AS (
    SELECT
      e.id AS emp_id,
      COALESCE(
        (SELECT ARRAY(SELECT jsonb_array_elements_text(p.weekly_offs)::int)
         FROM public.hr_employee_weekly_off eo
         JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
         WHERE eo.employee_id = e.id
           AND eo.is_current = true
           AND eo.effective_from <= v_month_end
         ORDER BY eo.effective_from DESC
         LIMIT 1),
        v_default_pattern
      ) AS off_days,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.hr_employee_weekly_off eo
          WHERE eo.employee_id = e.id AND eo.is_current = true
        ) THEN 'per_employee'
        WHEN v_first_active_pattern IS NOT NULL THEN 'tenant_default_pattern'
        ELSE 'hardcoded_sunday'
      END AS wo_source
    FROM public.hr_employees e
    WHERE e.id = ANY(p_employee_ids)
  ),
  cal AS (
    SELECT
      ep.emp_id, d::date AS dt, ep.off_days, ep.wo_source,
      CASE
        WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
        WHEN d::date IN (SELECT d FROM hols) THEN false
        ELSE true
      END AS is_working
    FROM emp_pat ep
    CROSS JOIN generate_series(v_month_start::timestamp, v_month_end::timestamp, interval '1 day') d
  ),
  wd AS (
    SELECT emp_id, off_days, wo_source, COUNT(*) FILTER (WHERE is_working)::numeric AS wdays
    FROM cal GROUP BY emp_id, off_days, wo_source
  ),
  att AS (
    SELECT
      a.employee_id AS emp_id,
      SUM(CASE WHEN LOWER(COALESCE(a.status,'')) = 'present' THEN 1
               WHEN LOWER(COALESCE(a.status,'')) = 'half_day' THEN 0.5
               WHEN COALESCE(a.total_hours,0) > 0
                    AND LOWER(COALESCE(a.status,'')) NOT IN ('incomplete','absent','on_leave','weekly_off','holiday','half_day')
                 THEN 1
               ELSE 0 END)::numeric AS present_d,
      SUM(CASE WHEN LOWER(COALESCE(a.status,'')) = 'absent' THEN 1 ELSE 0 END)::numeric AS absent_d,
      SUM(CASE WHEN LOWER(COALESCE(a.status,'')) = 'half_day' THEN 1 ELSE 0 END)::numeric AS half_d,
      SUM(CASE WHEN LOWER(COALESCE(a.status,'')) = 'incomplete'
                    AND (
                      public.hr_stale_session_held(a.employee_id, a.attendance_date)
                      OR EXISTS (
                        SELECT 1 FROM public.hr_attendance_regularization_requests r
                        WHERE r.employee_id = a.employee_id
                          AND r.attendance_date = a.attendance_date
                          AND LOWER(r.status) = 'approved'
                      )
                    )
               THEN 1 ELSE 0 END)::numeric AS incomplete_held_d
    FROM public.hr_attendance_daily a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY a.employee_id
  ),
  late_counts AS (
    SELECT lc.employee_id AS emp_id, COUNT(*)::numeric AS late_d
    FROM public.hr_late_come_early_out lc
    WHERE lc.employee_id = ANY(p_employee_ids)
      AND lc.type = 'late_come'
      AND lc.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY lc.employee_id
  ),
  lv AS (
    SELECT lr.id AS req_id, lr.employee_id AS emp_id, lt.is_paid, lt.name AS lt_name, lr.leave_type_id,
           lr.start_date, lr.end_date, COALESCE(lr.is_half_day,false) AS is_half_day,
           COALESCE(lr.paid_days, lr.total_days, 0)::numeric AS paid_days
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ANY(p_employee_ids)
      AND LOWER(lr.status) = 'approved'
      AND lr.start_date <= v_month_end
      AND lr.end_date   >= v_month_start
  ),
  -- Leave days that actually fall on the employee's working calendar,
  -- excluding any day the employee actually worked (balance restored there).
  lv_span AS (
    SELECT lv.req_id, lv.emp_id, lv.is_paid, lv.paid_days, lv.is_half_day,
           SUM(CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END)::numeric AS eff_days_in_month
    FROM lv
    JOIN LATERAL generate_series(GREATEST(lv.start_date, v_month_start)::timestamp,
                                 LEAST(lv.end_date, v_month_end)::timestamp,
                                 interval '1 day') d ON true
    JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.hr_leave_worked_days w
        WHERE w.employee_id = lv.emp_id AND w.attendance_date = d::date
      )
    GROUP BY lv.req_id, lv.emp_id, lv.is_paid, lv.paid_days, lv.is_half_day
  ),
  lv_days AS (
    -- Covered (paid) days are applied to the real working days first;
    -- only the genuine shortfall is unpaid.
    SELECT s.emp_id, s.is_paid,
           ROUND(SUM(LEAST(s.eff_days_in_month, GREATEST(s.paid_days, 0)))::numeric, 2) AS paid_days_in_month,
           ROUND(SUM(GREATEST(s.eff_days_in_month - GREATEST(s.paid_days, 0), 0))::numeric, 2) AS unpaid_days_in_month
    FROM lv_span s
    GROUP BY s.emp_id, s.is_paid
  ),
  lv_cfg AS (
    SELECT emp_id, ARRAY_AGG(DISTINCT format(
      'Leave type "%s" has no paid/unpaid setting — fix it before payroll.',
      COALESCE(lt_name, leave_type_id::text)
    )) AS errs
    FROM lv WHERE is_paid IS NULL GROUP BY emp_id
  ),
  paid   AS (SELECT emp_id, SUM(paid_days_in_month) AS d FROM lv_days WHERE is_paid = true GROUP BY emp_id),
  unpaid AS (SELECT emp_id, SUM(unpaid_days_in_month) AS d FROM lv_days GROUP BY emp_id)
  SELECT
    ep.emp_id,
    COALESCE(wd.wdays,0)::numeric,
    COALESCE(att.present_d,0)::numeric,
    COALESCE(paid.d,0)::numeric,
    COALESCE(unpaid.d,0)::numeric,
    COALESCE(att.incomplete_held_d,0)::numeric,
    COALESCE(att.absent_d,0)::numeric,
    COALESCE(att.half_d,0)::numeric,
    GREATEST(0, LEAST(
      COALESCE(wd.wdays,0),
      COALESCE(wd.wdays,0)
        - COALESCE(att.present_d,0)
        - COALESCE(paid.d,0)
        - COALESCE(att.incomplete_held_d,0)
        + CASE WHEN (SELECT policy.late_threshold FROM policy) > 0
               THEN FLOOR(COALESCE(lc.late_d,0) / (SELECT policy.late_threshold FROM policy))
               ELSE 0 END
        + CASE WHEN (SELECT policy.half_day_threshold FROM policy) > 0
               THEN FLOOR(COALESCE(att.half_d,0) / (SELECT policy.half_day_threshold FROM policy))
               ELSE 0 END
    ))::numeric,
    format('LOP = WD %s − (present %s + paid_leave %s + incomplete_held %s) + policy_lop(%s) = %s%s',
      COALESCE(wd.wdays,0), COALESCE(att.present_d,0),
      COALESCE(paid.d,0), COALESCE(att.incomplete_held_d,0),
      CASE WHEN (SELECT policy.late_threshold FROM policy) > 0
           THEN 'late:' || FLOOR(COALESCE(lc.late_d,0) / (SELECT policy.late_threshold FROM policy)) || '×' || (SELECT policy.late_threshold FROM policy)
           ELSE '' END
      ||
      CASE WHEN (SELECT policy.half_day_threshold FROM policy) > 0
           THEN ' half:' || FLOOR(COALESCE(att.half_d,0) / (SELECT policy.half_day_threshold FROM policy)) || '×' || (SELECT policy.half_day_threshold FROM policy)
           ELSE '' END,
      GREATEST(0, LEAST(COALESCE(wd.wdays,0),
        COALESCE(wd.wdays,0) - COALESCE(att.present_d,0) - COALESCE(paid.d,0) - COALESCE(att.incomplete_held_d,0)
        + CASE WHEN (SELECT policy.late_threshold FROM policy) > 0
               THEN FLOOR(COALESCE(lc.late_d,0) / (SELECT policy.late_threshold FROM policy))
               ELSE 0 END
        + CASE WHEN (SELECT policy.half_day_threshold FROM policy) > 0
               THEN FLOOR(COALESCE(att.half_d,0) / (SELECT policy.half_day_threshold FROM policy))
               ELSE 0 END
      )),
      CASE WHEN COALESCE(unpaid.d,0) > 0
           THEN format(' · %s leave day(s) not covered by any balance — counted as LOP', COALESCE(unpaid.d,0))
           ELSE '' END
    ),
    ep.off_days::int[],
    ep.wo_source,
    COALESCE(lv_cfg.errs, ARRAY[]::text[])
  FROM emp_pat ep
  LEFT JOIN wd     ON wd.emp_id=ep.emp_id
  LEFT JOIN att    ON att.emp_id=ep.emp_id
  LEFT JOIN paid   ON paid.emp_id=ep.emp_id
  LEFT JOIN unpaid ON unpaid.emp_id=ep.emp_id
  LEFT JOIN lv_cfg ON lv_cfg.emp_id=ep.emp_id
  LEFT JOIN late_counts lc ON lc.emp_id=ep.emp_id;
END;
$function$;