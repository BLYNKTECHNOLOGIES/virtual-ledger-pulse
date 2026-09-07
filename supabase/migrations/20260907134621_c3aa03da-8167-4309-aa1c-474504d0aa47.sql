-- 1. Pattern flags -----------------------------------------------------------
ALTER TABLE public.hr_weekly_off_patterns
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS counts_holidays_as_working boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excludes_leave_accrual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excludes_compoff boolean NOT NULL DEFAULT false;

UPDATE public.hr_weekly_off_patterns
   SET code = 'SUN_OFF'
 WHERE code IS NULL AND weekly_offs = ARRAY[0] AND COALESCE(is_alternating,false) = false;

UPDATE public.hr_weekly_off_patterns
   SET code = 'LEGACY_' || left(replace(id::text,'-',''), 8)
 WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_weekly_off_patterns_code
  ON public.hr_weekly_off_patterns (code);

-- 2. Pattern library ----------------------------------------------------------
INSERT INTO public.hr_weekly_off_patterns
  (code, name, description, weekly_offs, is_alternating, alternate_week_offs, is_active,
   counts_holidays_as_working, excludes_leave_accrual, excludes_compoff)
VALUES
  ('SAT_SUN_OFF','Saturday + Sunday Off','Five-day week: Saturday and Sunday are weekly offs.',ARRAY[0,6],false,NULL,true,false,false,false),
  ('ALT_SAT_SUN_OFF','2nd/4th Saturday + Sunday Off','Sunday off every week; 2nd and 4th Saturday of the month also off.',ARRAY[0],true,ARRAY[6],true,false,false,false),
  ('MON_OFF','Monday Off','Single weekly off on Monday (shift staff).',ARRAY[1],false,NULL,true,false,false,false),
  ('TUE_OFF','Tuesday Off','Single weekly off on Tuesday (shift staff).',ARRAY[2],false,NULL,true,false,false,false),
  ('WED_OFF','Wednesday Off','Single weekly off on Wednesday (shift staff).',ARRAY[3],false,NULL,true,false,false,false),
  ('THU_OFF','Thursday Off','Single weekly off on Thursday (shift staff).',ARRAY[4],false,NULL,true,false,false,false),
  ('FRI_OFF','Friday Off','Single weekly off on Friday (shift staff).',ARRAY[5],false,NULL,true,false,false,false),
  ('SAT_OFF','Saturday Off','Single weekly off on Saturday (shift staff).',ARRAY[6],false,NULL,true,false,false,false),
  ('ALL_WORKING','All Days Working (no weekly off, no holidays)',
   'Every calendar day is a working day, including Sundays and declared holidays. No leave accrual, no comp-off credit. Absence on any day is loss of pay.',
   ARRAY[]::integer[],false,NULL,true,true,true,true)
ON CONFLICT (code) DO NOTHING;

-- 3. Single resolver ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_employee_wo_policy(p_employee_id uuid)
RETURNS TABLE(off_days integer[], holidays_working boolean, no_accrual boolean, no_compoff boolean, source text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH assigned AS (
    SELECT COALESCE(p.weekly_offs, ARRAY[]::integer[])::integer[] AS off_days,
           COALESCE(p.counts_holidays_as_working,false) AS hw,
           COALESCE(p.excludes_leave_accrual,false) AS na,
           COALESCE(p.excludes_compoff,false) AS nc
    FROM public.hr_employee_weekly_off eo
    JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
    WHERE eo.employee_id = p_employee_id AND eo.is_current = true
    ORDER BY eo.effective_from DESC NULLS LAST
    LIMIT 1
  )
  SELECT a.off_days, a.hw, a.na, a.nc, 'per_employee'::text FROM assigned a
  UNION ALL
  SELECT ARRAY[0]::integer[], false, false, false, 'default_sunday'::text
  WHERE NOT EXISTS (SELECT 1 FROM assigned);
$function$;

GRANT EXECUTE ON FUNCTION public.hr_employee_wo_policy(uuid) TO authenticated, service_role;

-- 4. LOP engine ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_lop_days_window(p_employee_ids uuid[], p_period_month date, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, incomplete_held_days numeric, absent_days numeric, half_days numeric, lop_days numeric, formula text, weekly_off_days integer[], weekly_off_source text, config_errors text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_win_start   date := GREATEST(date_trunc('month', p_period_month)::date, COALESCE(p_from, date_trunc('month', p_period_month)::date));
  v_win_end     date := LEAST((date_trunc('month', p_period_month) + interval '1 month - 1 day')::date,
                              COALESCE(p_to, (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date));
  v_elapsed_end date;
BEGIN
  v_elapsed_end := LEAST(v_win_end, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  IF v_win_end < v_win_start THEN RETURN; END IF;

  RETURN QUERY
  WITH
  policy AS (
    SELECT
      COALESCE((SELECT ap.late_count_for_lop  FROM public.hr_attendance_policies ap WHERE ap.is_active = true AND ap.is_default = true LIMIT 1), 0) AS late_threshold,
      COALESCE((SELECT ap.half_day_count_for_lop FROM public.hr_attendance_policies ap WHERE ap.is_active = true AND ap.is_default = true LIMIT 1), 0) AS half_day_threshold
  ),
  hols AS (
    SELECT h.date::date AS d FROM public.hr_holidays h
    WHERE h.is_active = true AND h.date BETWEEN v_month_start AND v_month_end
    UNION
    SELECT make_date(EXTRACT(YEAR FROM v_month_start)::int, EXTRACT(MONTH FROM h.date)::int, EXTRACT(DAY FROM h.date)::int)
    FROM public.hr_holidays h
    WHERE h.is_active = true AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_month_start)::int
      AND EXTRACT(DAY FROM h.date)::int <= EXTRACT(DAY FROM v_month_end)::int
  ),
  punch_days AS (
    SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
    FROM public.hr_attendance_punches p
    WHERE p.employee_id = ANY(p_employee_ids)
      AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_win_start AND v_win_end
    GROUP BY 1,2
  ),
  session_days AS (
    SELECT s.employee_id AS emp_id, s.attendance_date AS dt
    FROM public.hr_attendance_sessions s
    WHERE s.employee_id = ANY(p_employee_ids) AND s.attendance_date BETWEEN v_win_start AND v_win_end
    GROUP BY 1,2
  ),
  evidence_days AS (SELECT emp_id, dt FROM punch_days UNION SELECT emp_id, dt FROM session_days),
  blackout AS (
    SELECT d::date AS dt
    FROM generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d
    WHERE NOT EXISTS (SELECT 1 FROM public.hr_attendance_punches p
                      WHERE (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date = d::date)
  ),
  emp_pat AS (
    SELECT e.id AS emp_id,
      wo.off_days,
      wo.holidays_working,
      wo.source AS wo_source,
      public.hr_is_contractor(e.id) AS is_contractor,
      GREATEST(v_win_start,
        COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi
                  WHERE wi.employee_id = e.id ORDER BY wi.joining_date NULLS LAST LIMIT 1), v_win_start)) AS emp_from,
      LEAST(v_elapsed_end, COALESCE(e.last_working_day, e.termination_date, v_elapsed_end)) AS emp_to
    FROM public.hr_employees e
    CROSS JOIN LATERAL public.hr_employee_wo_policy(e.id) wo
    WHERE e.id = ANY(p_employee_ids)
  ),
  cal AS (
    SELECT ep.emp_id, d::date AS dt, ep.off_days, ep.wo_source,
      CASE WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
           WHEN d::date IN (SELECT d FROM hols) AND NOT ep.holidays_working THEN false
           ELSE true END AS is_working,
      (d::date >= ep.emp_from AND d::date <= ep.emp_to) AS in_window
    FROM emp_pat ep
    CROSS JOIN generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d
  ),
  wd AS (
    SELECT emp_id, off_days, wo_source,
           COUNT(*) FILTER (WHERE is_working)::numeric AS wdays,
           COUNT(*) FILTER (WHERE is_working AND in_window)::numeric AS wdays_elapsed
    FROM cal GROUP BY emp_id, off_days, wo_source
  ),
  day_rows AS (
    SELECT c.emp_id, c.dt, LOWER(COALESCE(a.status,'')) AS st,
      (COALESCE(a.total_hours,0) > 0 OR a.first_in IS NOT NULL OR COALESCE(a.punch_count,0) > 0
        OR COALESCE(a.session_count,0) > 0 OR ev.dt IS NOT NULL) AS has_evidence,
      EXISTS (SELECT 1 FROM public.hr_attendance_regularization_requests r
              WHERE r.employee_id = c.emp_id AND r.attendance_date = c.dt AND LOWER(r.status) = 'approved') AS regularized,
      (bo.dt IS NOT NULL) AS is_blackout,
      public.hr_stale_session_held(c.emp_id, c.dt) AS stale_held,
      (a.employee_id IS NOT NULL) AS has_daily_row
    FROM cal c
    LEFT JOIN public.hr_attendance_daily a ON a.employee_id = c.emp_id AND a.attendance_date = c.dt
    LEFT JOIN evidence_days ev ON ev.emp_id = c.emp_id AND ev.dt = c.dt
    LEFT JOIN blackout bo ON bo.dt = c.dt
    WHERE c.is_working AND c.in_window
  ),
  full_credit_days AS (
    SELECT r.emp_id, r.dt FROM day_rows r
    WHERE r.st = 'present'
  ),
  att AS (
    SELECT r.emp_id,
      SUM(CASE WHEN r.st = 'half_day' THEN 0.5
               WHEN r.st IN ('absent','on_leave') THEN 0
               WHEN r.st = 'present' THEN 1
               WHEN r.has_evidence OR r.regularized THEN 1 ELSE 0 END)::numeric AS present_d,
      SUM(CASE WHEN r.st = 'absent' THEN 1 ELSE 0 END)::numeric AS absent_d,
      SUM(CASE WHEN r.st = 'half_day' THEN 1 ELSE 0 END)::numeric AS half_d,
      SUM(CASE WHEN r.st = 'incomplete' AND r.stale_held THEN 1
               WHEN r.is_blackout AND NOT r.has_evidence AND r.st NOT IN ('absent','on_leave') THEN 1
               ELSE 0 END)::numeric AS incomplete_held_d,
      SUM(CASE WHEN r.st IN ('present','half_day') AND NOT r.has_evidence AND NOT r.regularized
                    AND NOT r.is_blackout THEN 1 ELSE 0 END)::numeric AS unverified_d,
      COUNT(*) FILTER (WHERE r.has_evidence)::numeric AS evidence_day_count
    FROM day_rows r GROUP BY r.emp_id
  ),
  late_counts AS (
    SELECT lc.employee_id AS emp_id, COUNT(DISTINCT lc.attendance_date)::numeric AS late_d
    FROM public.hr_late_come_early_out lc
    WHERE lc.employee_id = ANY(p_employee_ids)
      AND lc.type = 'late_come'
      AND lc.attendance_date BETWEEN v_win_start AND v_win_end
    GROUP BY lc.employee_id
  ),
  lv AS (
    SELECT lr.id AS req_id, lr.employee_id AS emp_id, lt.is_paid, lt.name AS lt_name, lr.leave_type_id,
           lr.start_date, lr.end_date, COALESCE(lr.is_half_day,false) AS is_half_day,
           COALESCE(lr.paid_days, lr.total_days, 0)::numeric AS paid_days
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ANY(p_employee_ids) AND LOWER(lr.status) = 'approved'
      AND COALESCE(lr.source, '') <> 'auto_lop_absorption'
      AND lr.start_date <= v_win_end AND lr.end_date >= v_win_start
  ),
  lv_span AS (
    SELECT lv.req_id, lv.emp_id, lv.is_paid, lv.paid_days,
           SUM(CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END)::numeric AS eff_days_in_win
    FROM lv
    JOIN LATERAL generate_series(GREATEST(lv.start_date, v_win_start)::timestamp,
                                 LEAST(lv.end_date, v_win_end)::timestamp, interval '1 day') d ON true
    JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true AND c.in_window = true
    WHERE lv.is_paid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.hr_leave_worked_days w
        WHERE w.employee_id = lv.emp_id AND w.attendance_date = d::date
      )
      AND NOT EXISTS (
        SELECT 1 FROM full_credit_days f
        WHERE f.emp_id = lv.emp_id AND f.dt = d::date
      )
    GROUP BY lv.req_id, lv.emp_id, lv.is_paid, lv.paid_days
  ),
  lv_days AS (
    SELECT s.emp_id, s.is_paid,
           ROUND(SUM(LEAST(s.eff_days_in_win, GREATEST(s.paid_days,0)))::numeric, 2) AS paid_days_in_win,
           ROUND(SUM(GREATEST(s.eff_days_in_win - GREATEST(s.paid_days,0), 0))::numeric, 2) AS unpaid_days_in_win
    FROM lv_span s GROUP BY s.emp_id, s.is_paid
  ),
  lv_cfg AS (
    SELECT emp_id, ARRAY_AGG(DISTINCT format('Leave type "%s" has no paid/unpaid setting — fix it before payroll.',
      COALESCE(lt_name, leave_type_id::text))) AS errs
    FROM lv WHERE is_paid IS NULL GROUP BY emp_id
  ),
  paid   AS (SELECT emp_id, SUM(paid_days_in_win) AS d FROM lv_days WHERE is_paid=true GROUP BY emp_id),
  unpaid AS (SELECT emp_id, SUM(unpaid_days_in_win) AS d FROM lv_days GROUP BY emp_id),
  calc AS (
    SELECT ep.emp_id, ep.is_contractor, ep.off_days, ep.wo_source,
      COALESCE(wd.wdays,0)::numeric AS wdays,
      COALESCE(wd.wdays_elapsed,0)::numeric AS wdays_elapsed,
      COALESCE(att.present_d,0)::numeric AS present_d,
      COALESCE(att.absent_d,0)::numeric AS absent_d,
      COALESCE(att.half_d,0)::numeric AS half_d,
      COALESCE(att.incomplete_held_d,0)::numeric AS held_d,
      COALESCE(att.unverified_d,0)::numeric AS unverified_d,
      COALESCE(att.evidence_day_count,0)::numeric AS evidence_day_count,
      COALESCE(paid.d,0)::numeric AS paid_d,
      COALESCE(unpaid.d,0)::numeric AS unpaid_d,
      COALESCE(lc.late_d,0)::numeric AS late_d,
      COALESCE(lv_cfg.errs, ARRAY[]::text[]) AS errs
    FROM emp_pat ep
    LEFT JOIN wd ON wd.emp_id=ep.emp_id
    LEFT JOIN att ON att.emp_id=ep.emp_id
    LEFT JOIN paid ON paid.emp_id=ep.emp_id
    LEFT JOIN unpaid ON unpaid.emp_id=ep.emp_id
    LEFT JOIN lv_cfg ON lv_cfg.emp_id=ep.emp_id
    LEFT JOIN late_counts lc ON lc.emp_id=ep.emp_id
  )
  SELECT c.emp_id, c.wdays, c.present_d, c.paid_d, c.unpaid_d, c.held_d, c.absent_d, c.half_d,
    CASE WHEN c.is_contractor THEN 0::numeric
         WHEN c.evidence_day_count = 0 AND c.present_d = 0 AND c.paid_d = 0 AND c.unpaid_d = 0 THEN 0::numeric
         ELSE ROUND(GREATEST(0, LEAST(c.wdays_elapsed,
           c.wdays_elapsed - c.present_d - c.paid_d - c.held_d
           + CASE WHEN (SELECT policy.late_threshold FROM policy) > 0
                  THEN FLOOR(c.late_d / (SELECT policy.late_threshold FROM policy))
                  ELSE 0 END
           + CASE WHEN (SELECT policy.half_day_threshold FROM policy) > 0
                  THEN FLOOR(c.half_d / (SELECT policy.half_day_threshold FROM policy))
                  ELSE 0 END
         ))::numeric, 2) END,
    CASE WHEN c.is_contractor
           THEN 'LOP = 0 (contract employee — attendance shown for reference, never deducted)'
         WHEN c.evidence_day_count = 0 AND c.present_d = 0 AND c.paid_d = 0 AND c.unpaid_d = 0
           THEN 'LOP not derived — no biometric attendance signal in the window.'
         ELSE format('LOP = elapsed WD %s (of %s) − (present %s + paid_leave %s + held_harmless %s) + policy_lop(%s) = %s%s%s',
           c.wdays_elapsed, c.wdays, c.present_d, c.paid_d, c.held_d,
           CASE WHEN (SELECT policy.late_threshold FROM policy) > 0
                THEN 'late:' || FLOOR(c.late_d / (SELECT policy.late_threshold FROM policy)) || '×' || (SELECT policy.late_threshold FROM policy)
                ELSE '' END
           ||
           CASE WHEN (SELECT policy.half_day_threshold FROM policy) > 0
                THEN ' half:' || FLOOR(c.half_d / (SELECT policy.half_day_threshold FROM policy)) || '×' || (SELECT policy.half_day_threshold FROM policy)
                ELSE '' END,
           ROUND(GREATEST(0, LEAST(c.wdays_elapsed,
             c.wdays_elapsed - c.present_d - c.paid_d - c.held_d
             + CASE WHEN (SELECT policy.late_threshold FROM policy) > 0
                    THEN FLOOR(c.late_d / (SELECT policy.late_threshold FROM policy))
                    ELSE 0 END
             + CASE WHEN (SELECT policy.half_day_threshold FROM policy) > 0
                    THEN FLOOR(c.half_d / (SELECT policy.half_day_threshold FROM policy))
                    ELSE 0 END
           ))::numeric, 2),
           CASE WHEN c.unverified_d > 0
                THEN format(' · %s day(s) marked present with no punch evidence — credited as attended (owner policy)', c.unverified_d)
                ELSE '' END,
           CASE WHEN c.unpaid_d > 0
                THEN format(' · %s leave day(s) not covered by any balance — counted as LOP', c.unpaid_d)
                ELSE '' END) END,
    c.off_days::int[], c.wo_source,
    CASE WHEN c.evidence_day_count = 0 AND NOT c.is_contractor
           THEN c.errs || ARRAY['No biometric attendance signal in the window — enrolment/device mapping missing.']
         ELSE c.errs END
  FROM calc c;
END;
$function$;

-- 5. Joiner / leaver day counts ------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_employment_gap_working_days(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, month_working_days numeric, gap_working_days numeric, month_calendar_days numeric, gap_calendar_days numeric, emp_from date, emp_to date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
BEGIN
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
    SELECT e.id AS emp_id, wo.off_days, wo.holidays_working,
      (SELECT wi.joining_date FROM public.hr_employee_work_info wi
        WHERE wi.employee_id = e.id ORDER BY wi.joining_date NULLS LAST LIMIT 1) AS doj,
      COALESCE(e.last_working_day, e.termination_date) AS lwd,
      public.hr_is_contractor(e.id) AS is_contractor
    FROM public.hr_employees e
    CROSS JOIN LATERAL public.hr_employee_wo_policy(e.id) wo
    WHERE e.id = ANY(p_employee_ids)
  ),
  cal AS (
    SELECT ep.emp_id, d::date AS dt, ep.doj, ep.lwd, ep.is_contractor,
      CASE WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
           WHEN d::date IN (SELECT d FROM hols) AND NOT ep.holidays_working THEN false
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
    COUNT(*)::numeric,
    CASE WHEN bool_or(c.is_contractor) THEN 0::numeric
         ELSE COUNT(*) FILTER (
           WHERE ((c.doj IS NOT NULL AND c.dt < c.doj) OR (c.lwd IS NOT NULL AND c.dt > c.lwd))
         )::numeric END,
    MAX(c.doj), MAX(c.lwd)
  FROM cal c
  GROUP BY c.emp_id;
END;
$function$;

-- 6. Working-day / leave-day helpers -------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_working_days(p_employee_id uuid, p_start date, p_end date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pol RECORD;
  v_day DATE;
  v_dow INTEGER;
  v_working INTEGER := 0;
BEGIN
  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(p_employee_id);

  v_day := p_start;
  WHILE v_day <= p_end LOOP
    v_dow := EXTRACT(DOW FROM v_day)::INTEGER;
    IF v_dow = ANY(v_pol.off_days) THEN
      NULL;
    ELSIF NOT v_pol.holidays_working
          AND EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.date = v_day AND h.is_active = true) THEN
      NULL;
    ELSE
      v_working := v_working + 1;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  RETURN GREATEST(v_working, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_calculate_leave_days(p_employee_id uuid, p_start date, p_end date, p_leave_type_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_calendar_days INTEGER;
  v_exclude_holiday BOOLEAN;
  v_exclude_company_leave BOOLEAN;
  v_holidays INTEGER := 0;
  v_weekly_offs INTEGER := 0;
  v_pol RECORD;
  v_day DATE;
  v_dow INTEGER;
BEGIN
  v_calendar_days := (p_end - p_start) + 1;

  SELECT COALESCE(exclude_holiday, false), COALESCE(exclude_company_leave, false)
  INTO v_exclude_holiday, v_exclude_company_leave
  FROM hr_leave_types WHERE id = p_leave_type_id;

  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(p_employee_id);

  IF v_exclude_holiday AND NOT v_pol.holidays_working THEN
    SELECT COUNT(*) INTO v_holidays
    FROM hr_holidays
    WHERE date BETWEEN p_start AND p_end AND is_active = true;
  END IF;

  IF v_exclude_company_leave THEN
    v_day := p_start;
    WHILE v_day <= p_end LOOP
      v_dow := EXTRACT(DOW FROM v_day)::INTEGER;
      IF v_dow = ANY(v_pol.off_days) THEN
        v_weekly_offs := v_weekly_offs + 1;
      END IF;
      v_day := v_day + 1;
    END LOOP;
  END IF;

  RETURN GREATEST(v_calendar_days - v_holidays - v_weekly_offs, 0);
END;
$function$;

-- 7. Attendance guards ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_block_absent_on_weekly_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pol RECORD;
  v_status text;
  v_date date;
BEGIN
  IF TG_TABLE_NAME = 'hr_attendance' THEN
    v_status := NEW.attendance_status; v_date := NEW.attendance_date;
  ELSE
    v_status := NEW.status; v_date := NEW.attendance_date;
  END IF;

  IF v_status IS DISTINCT FROM 'absent' OR v_date IS NULL OR NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(NEW.employee_id);

  IF NOT v_pol.holidays_working AND public.hr_is_holiday(v_date) THEN
    IF TG_TABLE_NAME = 'hr_attendance' THEN
      RETURN NULL;
    ELSE
      NEW.status := 'no_data';
      RETURN NEW;
    END IF;
  END IF;

  IF EXTRACT(DOW FROM v_date)::int = ANY(v_pol.off_days) THEN
    IF TG_TABLE_NAME = 'hr_attendance' THEN
      RETURN NULL;
    ELSE
      NEW.status := 'no_data';
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_heal_no_data_absences(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
BEGIN
  WITH cand AS (
    SELECT d.employee_id, d.attendance_date,
           EXTRACT(DOW FROM d.attendance_date)::int AS dow_num
      FROM public.hr_attendance_daily d
      JOIN public.hr_employees e ON e.id = d.employee_id AND e.is_active = true
     WHERE d.attendance_date BETWEEN p_from AND p_to
       AND d.attendance_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND d.status = 'no_data'
       AND COALESCE(d.punch_count, 0) = 0
       AND (p_employee_id IS NULL OR d.employee_id = p_employee_id)
       AND NOT public.hr_v4_is_window_locked(d.attendance_date)
  ),
  cand_pol AS (
    SELECT c.*, w.off_days, w.holidays_working
      FROM cand c
      CROSS JOIN LATERAL public.hr_employee_wo_policy(c.employee_id) w
  ),
  filtered AS (
    SELECT c.*
      FROM cand_pol c
     WHERE (c.holidays_working OR NOT EXISTS (
              SELECT 1 FROM public.hr_holidays h
               WHERE h.date = c.attendance_date AND h.is_active = true))
       AND NOT EXISTS (
              SELECT 1 FROM public.hr_leave_requests lr
               WHERE lr.employee_id = c.employee_id
                 AND lr.status = 'approved'
                 AND lr.start_date <= c.attendance_date
                 AND lr.end_date >= c.attendance_date)
       AND NOT (c.dow_num = ANY (c.off_days))
  ),
  upd AS (
    UPDATE public.hr_attendance_daily d
       SET status = 'absent',
           flags = COALESCE(d.flags, '{}'::jsonb) || jsonb_build_object('auto_absent', true, 'healed_at', now()),
           updated_at = now()
      FROM filtered f
     WHERE d.employee_id = f.employee_id
       AND d.attendance_date = f.attendance_date
    RETURNING d.employee_id, d.attendance_date
  ),
  mirror AS (
    INSERT INTO public.hr_attendance (employee_id, attendance_date, attendance_status, check_in, check_out, overtime_hours, late_minutes, early_leave_minutes, notes)
    SELECT u.employee_id, u.attendance_date, 'absent', NULL, NULL, 0, 0, 0, 'auto-marked absent (heal)'
      FROM upd u
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
       SET attendance_status = 'absent', updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM upd;

  RETURN v_count;
END $function$;

-- 8. Comp-off auto credit --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
  v_pol RECORD;
  v_dow integer;
  v_is_weekly_off boolean := false;
  v_is_holiday boolean := false;
  v_credit_type text;
  v_reason text;
BEGIN
  IF NEW.status NOT IN ('present', 'late', 'half_day') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(NEW.employee_id);

  -- Patterns that treat every day as a working day never earn comp-off.
  IF v_pol.no_compoff THEN
    RETURN NEW;
  END IF;

  v_dow := extract(dow from NEW.attendance_date)::integer;
  v_is_weekly_off := v_dow = ANY(v_pol.off_days);

  IF NOT v_pol.holidays_working THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hr_holidays h
      WHERE h.date = NEW.attendance_date AND h.is_active = true
    ) INTO v_is_holiday;
  END IF;

  IF NOT v_is_weekly_off AND NOT v_is_holiday THEN
    RETURN NEW;
  END IF;

  v_credit_type := CASE WHEN v_is_holiday THEN 'holiday' ELSE 'sunday_work' END;
  v_reason := CASE
    WHEN v_is_holiday AND v_is_weekly_off THEN 'Auto-granted: worked on company holiday and weekly-off day'
    WHEN v_is_holiday THEN 'Auto-granted: worked on company holiday'
    ELSE 'Auto-granted: worked on weekly-off day (' || to_char(NEW.attendance_date, 'Dy') || ', ' || NEW.status || ')'
  END;

  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, v_credit_type, 1, false, v_reason
  )
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'granted', v_reason, TG_OP, v_inserted_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 9. Leave-day stamping ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_stamp_leave_attendance(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  d date;
  v_pol RECORD;
BEGIN
  SELECT * INTO r FROM public.hr_leave_requests WHERE id = p_request_id;
  IF r IS NULL OR r.start_date IS NULL OR r.end_date IS NULL THEN RETURN; END IF;

  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(r.employee_id);

  d := r.start_date;
  WHILE d <= r.end_date LOOP
    IF NOT (EXTRACT(DOW FROM d)::int = ANY(v_pol.off_days))
       AND (v_pol.holidays_working
            OR NOT EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.date = d AND h.is_active = true))
    THEN
      IF r.status = 'approved' THEN
        INSERT INTO public.hr_attendance_daily
          (employee_id, attendance_date, status, punch_count, session_count, total_hours,
           net_work_minutes, engine_version, flags)
        VALUES (r.employee_id, d, 'on_leave', 0, 0, 0, 0, 'v4',
                jsonb_build_object('leave_request_id', r.id, 'auto_leave', true))
        ON CONFLICT (employee_id, attendance_date) DO UPDATE
          SET status = 'on_leave',
              flags = COALESCE(public.hr_attendance_daily.flags, '{}'::jsonb)
                      || jsonb_build_object('leave_request_id', r.id, 'auto_leave', true),
              updated_at = now();
      END IF;
    END IF;
    d := d + 1;
  END LOOP;
END;
$function$;

-- 10. Leave accrual ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_leave_accrual(p_accrual_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
  v_emp RECORD;
  v_count int := 0;
  v_year int := EXTRACT(YEAR FROM p_accrual_date)::int;
  v_month int := EXTRACT(MONTH FROM p_accrual_date)::int;
  v_quarter int := EXTRACT(QUARTER FROM p_accrual_date)::int;
  v_bucket int;
  v_block_sl boolean;
  v_is_sl boolean;
  v_start date;
  v_last date;
  v_due boolean;
  v_amount numeric;
  v_cap numeric;
  v_prev_avail numeric;
  v_exists int;
  v_no_accrual boolean;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('run_leave_accrual')) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('hr.accrual_as_of', p_accrual_date::text, true);

  v_block_sl := COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true);

  FOR v_plan IN
    SELECT ap.*, lt.code AS lt_code, lt.name AS lt_name,
           public.hr_is_sick_leave_code(lt.code, lt.name) AS lt_is_sick
      FROM public.hr_leave_accrual_plans ap
      JOIN public.hr_leave_types lt ON lt.id = ap.leave_type_id
     WHERE ap.is_active = true
       AND ap.effective_from <= p_accrual_date
       AND COALESCE(lt.is_active, true) = true
  LOOP
    v_is_sl := v_plan.lt_is_sick AND v_block_sl;
    v_bucket := 0;

    IF EXTRACT(DAY FROM p_accrual_date)::int < v_plan.accrual_day THEN
      CONTINUE;
    END IF;

    IF v_plan.cycle_basis = 'calendar' THEN
      IF v_plan.accrual_period = 'quarterly' THEN
        v_bucket := v_quarter;
        IF v_month NOT IN (1,4,7,10) THEN CONTINUE; END IF;
      ELSIF v_plan.accrual_period = 'yearly' THEN
        IF v_month <> 1 THEN CONTINUE; END IF;
      ELSIF v_plan.accrual_period <> 'monthly' THEN
        CONTINUE;
      END IF;
    END IF;

    FOR v_emp IN
      SELECT e.id AS employee_id,
             COALESCE(wi.joining_date, e.created_at::date) AS joining_date
        FROM public.hr_employees e
        LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
       WHERE e.is_active = true
         AND (v_plan.applicable_to = 'all'
              OR (v_plan.applicable_to = 'department' AND wi.department_id = v_plan.department_id)
              OR (v_plan.applicable_to = 'position'   AND wi.job_position_id = v_plan.position_id))
    LOOP
      -- Weekly-off patterns that treat every day as working carry no leave accrual.
      SELECT w.no_accrual INTO v_no_accrual FROM public.hr_employee_wo_policy(v_emp.employee_id) w;
      IF COALESCE(v_no_accrual, false) THEN
        CONTINUE;
      END IF;

      IF v_plan.start_trigger = 'probation_end' THEN
        v_start := public.hr_probation_end_date(v_emp.employee_id);
        IF v_start IS NULL THEN CONTINUE; END IF;
        v_start := v_start + 1;
      ELSE
        v_start := v_emp.joining_date;
      END IF;
      IF v_start IS NULL OR v_start > p_accrual_date THEN CONTINUE; END IF;

      IF v_is_sl AND public.hr_is_on_probation(v_emp.employee_id, p_accrual_date) THEN
        CONTINUE;
      END IF;

      SELECT MAX(accrual_date) INTO v_last
        FROM public.hr_leave_accrual_log
       WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id;

      IF v_plan.cycle_basis = 'anniversary' THEN
        v_due := (v_last IS NULL)
                 OR (v_last + (CASE v_plan.accrual_period
                                 WHEN 'monthly' THEN interval '1 month'
                                 WHEN 'quarterly' THEN interval '3 months'
                                 ELSE interval '12 months' END))::date <= p_accrual_date;
      ELSE
        IF v_plan.accrual_period = 'monthly' THEN
          SELECT COUNT(*) INTO v_exists FROM public.hr_leave_accrual_log
           WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id
             AND EXTRACT(YEAR FROM accrual_date)::int = v_year
             AND EXTRACT(MONTH FROM accrual_date)::int = v_month;
        ELSIF v_plan.accrual_period = 'quarterly' THEN
          SELECT COUNT(*) INTO v_exists FROM public.hr_leave_accrual_log
           WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id
             AND year = v_year AND quarter = v_quarter;
        ELSE
          SELECT COUNT(*) INTO v_exists FROM public.hr_leave_accrual_log
           WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id
             AND year = v_year;
        END IF;
        v_due := (v_exists = 0);
      END IF;

      IF NOT v_due THEN CONTINUE; END IF;

      v_amount := v_plan.accrual_amount;
      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;
      v_cap := v_plan.max_accrual;

      SELECT COUNT(*) INTO v_exists FROM public.hr_leave_allocations
       WHERE employee_id = v_emp.employee_id AND leave_type_id = v_plan.leave_type_id
         AND year = v_year AND quarter = v_bucket;
      IF v_exists = 0 THEN
        SELECT COALESCE(SUM(GREATEST(COALESCE(available_days, allocated_days - COALESCE(used_days,0)), 0)), 0)
          INTO v_prev_avail
          FROM public.hr_leave_allocations
         WHERE employee_id = v_emp.employee_id AND leave_type_id = v_plan.leave_type_id
           AND year = v_year - 1;
        IF v_prev_avail > 0 THEN
          INSERT INTO public.hr_leave_allocations
            (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days, carry_forward_days)
          VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_bucket, v_prev_avail, v_prev_avail, 0, v_prev_avail)
          ON CONFLICT (employee_id, leave_type_id, year, quarter) DO NOTHING;
        END IF;
      END IF;

      INSERT INTO public.hr_leave_allocations
        (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days)
      VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_bucket, v_amount, v_amount, 0)
      ON CONFLICT (employee_id, leave_type_id, year, quarter) DO UPDATE SET
        allocated_days = CASE WHEN v_cap IS NULL
                              THEN public.hr_leave_allocations.allocated_days + v_amount
                              ELSE LEAST(public.hr_leave_allocations.allocated_days + v_amount, v_cap) END,
        available_days = CASE WHEN v_cap IS NULL
                              THEN COALESCE(public.hr_leave_allocations.available_days, 0) + v_amount
                              ELSE LEAST(COALESCE(public.hr_leave_allocations.available_days, 0) + v_amount, v_cap) END,
        updated_at = now();

      INSERT INTO public.hr_leave_accrual_log
        (accrual_plan_id, employee_id, accrued_days, accrual_date, year, quarter)
      VALUES (v_plan.id, v_emp.employee_id, v_amount, p_accrual_date, v_year, v_bucket);

      v_count := v_count + 1;
    END LOOP;

    UPDATE public.hr_leave_accrual_plans
       SET last_accrual_date = p_accrual_date, updated_at = now()
     WHERE id = v_plan.id;
  END LOOP;

  RETURN v_count;
END;
$function$;