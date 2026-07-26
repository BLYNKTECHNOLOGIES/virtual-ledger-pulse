-- =========================================================
-- Slice R4: canonical hr_lop_days — single source of truth
-- Contract:
--   absent                          -> 1
--   half_day                        -> 0.5
--   unpaid leave (hr_leave_types.is_paid=false, approved)  -> 1
--   incomplete + unresolved stale session for that day     -> 0 (held harmless)
--   incomplete + no unresolved stale session                -> falls through to shortfall
--   present / weekly_off / holiday / paid leave             -> 0
-- Result is capped at [0, working_days].
-- =========================================================

CREATE OR REPLACE FUNCTION public.hr_stale_session_held(
  p_employee_id uuid,
  p_date date
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_attendance_stale_sessions ss
    WHERE ss.employee_id = p_employee_id
      AND ss.attendance_date = p_date
      AND ss.status = 'open'
  );
$$;
GRANT EXECUTE ON FUNCTION public.hr_stale_session_held(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_lop_days(
  p_employee_ids uuid[],
  p_period_month date
)
RETURNS TABLE (
  employee_id                 uuid,
  working_days                numeric,
  present_days                numeric,
  paid_leave_days             numeric,
  unpaid_leave_days           numeric,
  incomplete_held_days        numeric,
  absent_days                 numeric,
  half_days                   numeric,
  lop_days                    numeric,
  formula                     text,
  weekly_off_days             int[],
  weekly_off_source           text,
  config_errors               text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      -- Incomplete day is held harmless (0 LOP) ONLY while an unresolved stale
      -- session exists OR an approved regularization exists. Otherwise it flows
      -- into the shortfall like any un-worked working day.
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
    GREATEST(0, LEAST(
      COALESCE(wd.wdays,0),
      COALESCE(wd.wdays,0)
        - COALESCE(att.present_d,0)
        - COALESCE(paid.d,0)
        - COALESCE(att.incomplete_held_d,0)
    ))::numeric,
    format('LOP = WD %s − (present %s + paid_leave %s + incomplete_held %s) = %s',
      COALESCE(wd.wdays,0), COALESCE(att.present_d,0),
      COALESCE(paid.d,0), COALESCE(att.incomplete_held_d,0),
      GREATEST(0, LEAST(COALESCE(wd.wdays,0),
        COALESCE(wd.wdays,0) - COALESCE(att.present_d,0)
        - COALESCE(paid.d,0) - COALESCE(att.incomplete_held_d,0)))
    ),
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
$$;
GRANT EXECUTE ON FUNCTION public.hr_lop_days(uuid[], date) TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_lop_days(uuid[], date) IS
'CANONICAL LOP contract (R4). Consumers: payroll attendance push, shadow payroll, per-day display. Rules encoded here; do not translate statuses locally.';

-- Back-compat wrapper so any existing caller of hr_compute_lop_days keeps working.
-- Old callers get a subset of columns; new callers should migrate to hr_lop_days.
CREATE OR REPLACE FUNCTION public.hr_compute_lop_days(
  p_employee_ids uuid[],
  p_period_month date
) RETURNS TABLE (
  employee_id uuid,
  working_days numeric,
  present_days numeric,
  paid_leave_days numeric,
  unpaid_leave_days numeric,
  incomplete_unresolved_days numeric,
  lop_days numeric,
  formula text,
  weekly_off_days int[],
  weekly_off_source text,
  config_errors text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT employee_id, working_days, present_days, paid_leave_days, unpaid_leave_days,
         incomplete_held_days AS incomplete_unresolved_days,
         lop_days, formula, weekly_off_days, weekly_off_source, config_errors
  FROM public.hr_lop_days(p_employee_ids, p_period_month);
$$;
GRANT EXECUTE ON FUNCTION public.hr_compute_lop_days(uuid[], date) TO authenticated, service_role;

-- =========================================================
-- Slice R5: extended day drill-down
-- =========================================================
CREATE OR REPLACE FUNCTION public.hr_attendance_day_detail(
  p_employee_id uuid,
  p_date date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_daily RECORD;
  v_punches_all jsonb;
  v_kept jsonb;
  v_suppressed jsonb;
  v_sessions jsonb;
  v_stale jsonb;
  v_reg jsonb;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_lop_row RECORD;
  v_night_span boolean := false;
  v_shift_dev boolean := false;
BEGIN
  v_window_start := ((p_date::text) || ' 05:00:00 Asia/Kolkata')::timestamptz;
  v_window_end   := (((p_date + 1)::text) || ' 05:00:00 Asia/Kolkata')::timestamptz;

  SELECT * INTO v_daily FROM public.hr_attendance_daily
   WHERE employee_id = p_employee_id AND attendance_date = p_date LIMIT 1;

  -- Punches split into kept vs suppressed with reasons.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'punch_time', p.punch_time, 'punch_type', p.punch_type,
      'device_name', p.device_name, 'device_serial', p.device_serial,
      'effective', p.effective, 'suppressed_reason', p.suppressed_reason,
      'raw_status', p.raw_status
    ) ORDER BY p.punch_time), '[]'::jsonb)
    INTO v_punches_all
    FROM public.hr_attendance_punches p
   WHERE p.employee_id = p_employee_id
     AND p.punch_time >= v_window_start
     AND p.punch_time < v_window_end;

  SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'punch_time')), '[]'::jsonb)
    INTO v_kept
    FROM jsonb_array_elements(v_punches_all) elem
   WHERE (elem->>'effective')::boolean IS TRUE
      OR ((elem->>'effective') IS NULL AND (elem->>'suppressed_reason') IS NULL);

  SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'punch_time')), '[]'::jsonb)
    INTO v_suppressed
    FROM jsonb_array_elements(v_punches_all) elem
   WHERE (elem->>'suppressed_reason') IS NOT NULL
      OR (elem->>'effective')::boolean IS FALSE;

  -- Sessions with an arithmetic-friendly `label` line.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'session_no', s.session_no,
      'in_time', s.in_time, 'out_time', s.out_time,
      'minutes', s.minutes, 'flags', s.flags,
      'is_open', s.out_time IS NULL,
      'label',
        CASE
          WHEN s.out_time IS NULL THEN
            to_char(s.in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || ' – (open)'
          ELSE
            to_char(s.in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')
            || ' – ' ||
            to_char(s.out_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')
            || ' = ' ||
            (COALESCE(s.minutes,0)/60)::int || 'h ' ||
            lpad((COALESCE(s.minutes,0) % 60)::text, 2, '0') || 'm'
        END
    ) ORDER BY s.session_no), '[]'::jsonb)
    INTO v_sessions
    FROM public.hr_attendance_sessions s
   WHERE s.employee_id = p_employee_id AND s.attendance_date = p_date;

  -- Night-span detection: any session that crosses midnight IST.
  SELECT bool_or(
    to_char(s.in_time  AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD')
    <>
    to_char(COALESCE(s.out_time, s.in_time) AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD')
  ) INTO v_night_span
  FROM public.hr_attendance_sessions s
  WHERE s.employee_id = p_employee_id AND s.attendance_date = p_date;
  v_night_span := COALESCE(v_night_span, false);

  -- Shift deviation: first_in outside the shift's window by >45min.
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.hr_employee_shift_schedule es
      JOIN public.hr_shifts sh ON sh.id = es.shift_id
      WHERE es.employee_id = p_employee_id
        AND es.is_current = true
        AND v_daily.first_in IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (
          v_daily.first_in
          - ((p_date::text || ' ' || sh.start_time)::timestamp AT TIME ZONE 'Asia/Kolkata')
        )) / 60) > 45
    ) INTO v_shift_dev;
  EXCEPTION WHEN OTHERS THEN v_shift_dev := false;
  END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ss.id, 'session_id', ss.session_id, 'status', ss.status,
      'hours_open', ss.hours_open, 'resolved_at', ss.resolved_at,
      'resolution_note', ss.resolution_note
    )), '[]'::jsonb) INTO v_stale
    FROM public.hr_attendance_stale_sessions ss
   WHERE ss.employee_id = p_employee_id AND ss.attendance_date = p_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'requested_check_in', r.requested_check_in,
      'requested_check_out', r.requested_check_out, 'reason', r.reason,
      'reason_code', r.reason_code, 'approver_notes', r.approver_notes
    )), '[]'::jsonb) INTO v_reg
    FROM public.hr_attendance_regularization_requests r
   WHERE r.employee_id = p_employee_id AND r.attendance_date = p_date;

  -- LOP contribution just for this day (0 / 0.5 / 1).
  BEGIN
    SELECT lop_days INTO v_lop_row
    FROM public.hr_lop_days(ARRAY[p_employee_id]::uuid[], p_date);
  EXCEPTION WHEN OTHERS THEN v_lop_row := NULL;
  END;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'window_date', p_date,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'daily', CASE WHEN v_daily.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_daily.status,
      'first_in', v_daily.first_in, 'last_out', v_daily.last_out,
      'total_hours', v_daily.total_hours,
      'net_work_minutes', v_daily.net_work_minutes,
      'break_minutes', v_daily.break_minutes,
      'lunch_minutes', v_daily.lunch_minutes,
      'session_count', v_daily.session_count,
      'suppressed_count', v_daily.suppressed_count,
      'is_late', v_daily.is_late, 'late_by_minutes', v_daily.late_by_minutes,
      'early_departure', v_daily.early_departure, 'early_by_minutes', v_daily.early_by_minutes,
      'engine_version', v_daily.engine_version, 'flags', v_daily.flags
    ) END,
    'punches', v_punches_all,
    'kept_punches', v_kept,
    'suppressed_punches', v_suppressed,
    'sessions', v_sessions,
    'stale_sessions', v_stale,
    'regularizations', v_reg,
    'flags', jsonb_build_object(
      'night_span', v_night_span,
      'shift_deviation', v_shift_dev
    ),
    'lop_contribution', CASE
      WHEN v_lop_row.lop_days IS NULL THEN 0
      WHEN v_lop_row.lop_days::numeric >= 1 THEN 1
      WHEN v_lop_row.lop_days::numeric >= 0.5 THEN 0.5
      ELSE 0
    END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.hr_attendance_day_detail(uuid, date) TO authenticated, service_role;

-- =========================================================
-- Slice R3: roster completeness health
-- =========================================================
CREATE OR REPLACE FUNCTION public.hr_roster_completeness()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH active AS (
    SELECT id, badge_id, first_name, last_name
    FROM public.hr_employees
    WHERE COALESCE(is_active, true) = true
      AND termination_date IS NULL
  ),
  missing_shift AS (
    SELECT a.id, a.badge_id, a.first_name, a.last_name
    FROM active a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.hr_employee_shift_schedule s
      WHERE s.employee_id = a.id AND s.is_current = true
    )
  ),
  missing_woff AS (
    SELECT a.id, a.badge_id, a.first_name, a.last_name
    FROM active a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.hr_employee_weekly_off w
      WHERE w.employee_id = a.id AND w.is_current = true
    )
  )
  SELECT jsonb_build_object(
    'active_total', (SELECT count(*) FROM active),
    'missing_shift_count',       (SELECT count(*) FROM missing_shift),
    'missing_weekly_off_count',  (SELECT count(*) FROM missing_woff),
    'missing_shift',      COALESCE((SELECT jsonb_agg(row_to_json(missing_shift)) FROM missing_shift), '[]'::jsonb),
    'missing_weekly_off', COALESCE((SELECT jsonb_agg(row_to_json(missing_woff))  FROM missing_woff),  '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.hr_roster_completeness() TO authenticated, service_role;