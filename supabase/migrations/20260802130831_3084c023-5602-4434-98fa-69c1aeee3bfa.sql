CREATE OR REPLACE FUNCTION public.hr_lop_days(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, incomplete_held_days numeric, absent_days numeric, half_days numeric, lop_days numeric, formula text, weekly_off_days integer[], weekly_off_source text, config_errors text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_elapsed_end date := LEAST(v_month_end, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_default_pattern int[] := ARRAY[0];
  v_first_active_pattern int[];
BEGIN
  SELECT p.weekly_offs
  INTO v_first_active_pattern
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true
    AND p.weekly_offs IS NOT NULL
    AND array_length(p.weekly_offs, 1) > 0
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;
  IF v_first_active_pattern IS NOT NULL AND array_length(v_first_active_pattern,1) > 0 THEN
    v_default_pattern := v_first_active_pattern;
  END IF;

  RETURN QUERY
  WITH
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
  -- Days on which the biometric estate produced NO punch for ANYONE.
  -- Those are device/outage gaps, never employee absence: held harmless.
  blackout AS (
    SELECT d::date AS dt
    FROM generate_series(v_month_start::timestamp, v_month_end::timestamp, interval '1 day') d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.hr_attendance_punches p
      WHERE (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date = d::date
    )
  ),
  emp_pat AS (
    SELECT
      e.id AS emp_id,
      COALESCE(
        (SELECT p.weekly_offs
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
      END AS wo_source,
      public.hr_is_contractor(e.id) AS is_contractor,
      GREATEST(
        v_month_start,
        COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi
                  WHERE wi.employee_id = e.id ORDER BY wi.joining_date NULLS LAST LIMIT 1),
                 v_month_start)
      ) AS emp_from,
      LEAST(
        v_elapsed_end,
        COALESCE(e.last_working_day, e.termination_date, v_elapsed_end)
      ) AS emp_to
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
      END AS is_working,
      (d::date >= ep.emp_from AND d::date <= ep.emp_to) AS in_window
    FROM emp_pat ep
    CROSS JOIN generate_series(v_month_start::timestamp, v_month_end::timestamp, interval '1 day') d
  ),
  wd AS (
    SELECT emp_id, off_days, wo_source,
           COUNT(*) FILTER (WHERE is_working)::numeric AS wdays,
           COUNT(*) FILTER (WHERE is_working AND in_window)::numeric AS wdays_elapsed
    FROM cal GROUP BY emp_id, off_days, wo_source
  ),
  -- Per-day classification. A 'present' mark is only believed when the row
  -- carries actual attendance evidence (punch / in-time / worked hours) or an
  -- approved regularisation. Blanket normalisations with no signal are
  -- reported as unverified, and are only forgiven on estate-wide blackout days.
  att_rows AS (
    SELECT
      a.employee_id AS emp_id,
      a.attendance_date AS dt,
      LOWER(COALESCE(a.status,'')) AS st,
      (COALESCE(a.total_hours,0) > 0
        OR a.first_in IS NOT NULL
        OR COALESCE(a.punch_count,0) > 0
        OR COALESCE(a.session_count,0) > 0) AS has_evidence,
      EXISTS (
        SELECT 1 FROM public.hr_attendance_regularization_requests r
        WHERE r.employee_id = a.employee_id
          AND r.attendance_date = a.attendance_date
          AND LOWER(r.status) = 'approved'
      ) AS regularized,
      (a.attendance_date IN (SELECT dt FROM blackout)) AS is_blackout,
      public.hr_stale_session_held(a.employee_id, a.attendance_date) AS stale_held
    FROM public.hr_attendance_daily a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_month_end
  ),
  att AS (
    SELECT
      r.emp_id,
      SUM(CASE
            WHEN r.st = 'present'  AND (r.has_evidence OR r.regularized) THEN 1
            WHEN r.st = 'half_day' AND (r.has_evidence OR r.regularized) THEN 0.5
            WHEN r.has_evidence
                 AND r.st NOT IN ('incomplete','absent','on_leave','weekly_off','holiday','half_day','present')
              THEN 1
            ELSE 0 END)::numeric AS present_d,
      SUM(CASE WHEN r.st = 'absent' THEN 1 ELSE 0 END)::numeric AS absent_d,
      SUM(CASE WHEN r.st = 'half_day' THEN 1 ELSE 0 END)::numeric AS half_d,
      -- held harmless: stale/regularised incomplete days, plus any day that
      -- fell inside an estate-wide biometric blackout.
      SUM(CASE
            WHEN r.st = 'incomplete' AND (r.stale_held OR r.regularized) THEN 1
            WHEN r.is_blackout AND NOT r.has_evidence AND r.st NOT IN ('absent','on_leave') THEN 1
            ELSE 0 END)::numeric AS incomplete_held_d,
      -- diagnostics: marked present/half-day but no signal and no blackout cover
      SUM(CASE
            WHEN r.st IN ('present','half_day')
                 AND NOT r.has_evidence AND NOT r.regularized AND NOT r.is_blackout
              THEN 1 ELSE 0 END)::numeric AS unverified_d
    FROM att_rows r
    GROUP BY r.emp_id
  ),
  lv AS (
    SELECT lr.employee_id AS emp_id, lt.is_paid, lt.name AS lt_name, lr.leave_type_id,
           lr.start_date, lr.end_date, lr.is_half_day
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ANY(p_employee_ids)
      AND LOWER(lr.status) = 'approved'
      AND lr.start_date <= v_month_end
      AND lr.end_date   >= v_month_start
  ),
  lv_days AS (
    SELECT lv.emp_id, lv.is_paid,
           SUM(CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END)::numeric AS days
    FROM lv
    JOIN LATERAL generate_series(GREATEST(lv.start_date, v_month_start)::timestamp,
                                 LEAST(lv.end_date, v_month_end)::timestamp,
                                 interval '1 day') d ON true
    JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL
    GROUP BY lv.emp_id, lv.is_paid
  ),
  lv_cfg AS (
    SELECT emp_id, ARRAY_AGG(DISTINCT format(
      'Leave type "%s" has no paid/unpaid setting — fix it before payroll.',
      COALESCE(lt_name, leave_type_id::text)
    )) AS errs
    FROM lv WHERE is_paid IS NULL GROUP BY emp_id
  ),
  paid   AS (SELECT emp_id, SUM(days) AS d FROM lv_days WHERE is_paid=true  GROUP BY emp_id),
  unpaid AS (SELECT emp_id, SUM(days) AS d FROM lv_days WHERE is_paid=false GROUP BY emp_id)
  SELECT
    ep.emp_id,
    COALESCE(wd.wdays,0)::numeric,
    COALESCE(att.present_d,0)::numeric,
    COALESCE(paid.d,0)::numeric,
    COALESCE(unpaid.d,0)::numeric,
    COALESCE(att.incomplete_held_d,0)::numeric,
    COALESCE(att.absent_d,0)::numeric,
    COALESCE(att.half_d,0)::numeric,
    CASE WHEN ep.is_contractor THEN 0::numeric ELSE
      GREATEST(0, LEAST(
        COALESCE(wd.wdays_elapsed,0),
        COALESCE(wd.wdays_elapsed,0)
          - COALESCE(att.present_d,0)
          - COALESCE(paid.d,0)
          - COALESCE(att.incomplete_held_d,0)
      ))::numeric
    END,
    CASE WHEN ep.is_contractor
      THEN 'LOP = 0 (contract employee — attendance shown for reference, never deducted)'
      ELSE format('LOP = elapsed WD %s (of %s) − (verified present %s + paid_leave %s + held_harmless %s) = %s%s',
        COALESCE(wd.wdays_elapsed,0), COALESCE(wd.wdays,0), COALESCE(att.present_d,0),
        COALESCE(paid.d,0), COALESCE(att.incomplete_held_d,0),
        GREATEST(0, LEAST(COALESCE(wd.wdays_elapsed,0),
          COALESCE(wd.wdays_elapsed,0) - COALESCE(att.present_d,0)
          - COALESCE(paid.d,0) - COALESCE(att.incomplete_held_d,0))),
        CASE WHEN COALESCE(att.unverified_d,0) > 0
             THEN format(' · %s day(s) marked present with no punch evidence — not counted as attended',
                         COALESCE(att.unverified_d,0))
             ELSE '' END)
    END,
    ep.off_days::int[],
    ep.wo_source,
    COALESCE(lv_cfg.errs, ARRAY[]::text[])
  FROM emp_pat ep
  LEFT JOIN wd     ON wd.emp_id=ep.emp_id
  LEFT JOIN att    ON att.emp_id=ep.emp_id
  LEFT JOIN paid   ON paid.emp_id=ep.emp_id
  LEFT JOIN unpaid ON unpaid.emp_id=ep.emp_id
  LEFT JOIN lv_cfg ON lv_cfg.emp_id=ep.emp_id;
END;
$function$;