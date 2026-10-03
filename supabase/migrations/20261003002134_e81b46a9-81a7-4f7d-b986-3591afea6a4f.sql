-- 1) Old list copies the calendar's times and late/early minutes too.
CREATE OR REPLACE FUNCTION public.trg_hr_legacy_follow_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_cal text;
BEGIN
  SELECT * INTO d FROM public.hr_attendance_daily
   WHERE employee_id = NEW.employee_id AND attendance_date = NEW.attendance_date;
  IF FOUND THEN
    NEW.late_minutes := COALESCE(d.late_by_minutes, 0);
    NEW.early_leave_minutes := COALESCE(d.early_by_minutes, 0);
    IF d.first_in IS NOT NULL THEN NEW.check_in := d.first_in; END IF;
    IF d.last_out IS NOT NULL THEN NEW.check_out := d.last_out; END IF;
  END IF;

  IF current_setting('hr.legacy_mirror', true) = 'on'
     OR current_setting('hr.legacy_routing', true) = 'on' THEN RETURN NEW; END IF;
  IF public.hr_legacy_write_is_hr_mark(NEW.attendance_status,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.attendance_status END, TG_OP) THEN
    RETURN NEW;
  END IF;
  IF d.employee_id IS NOT NULL THEN
    v_cal := public.hr_calendar_to_legacy_status(coalesce(d.manual_status, d.status));
    IF v_cal IS NULL THEN RETURN NULL; END IF;
    NEW.attendance_status := v_cal;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_hr_legacy_follow_calendar() FROM PUBLIC, anon, authenticated;

-- 2) Employee monthly summary now reads the calendar.
CREATE OR REPLACE VIEW public.hr_monthly_hours_summary WITH (security_invoker = true) AS
WITH g AS (
  SELECT d.employee_id,
    date_trunc('month', d.attendance_date::timestamptz)::date AS month,
    count(*) FILTER (WHERE lower(coalesce(d.manual_status, d.status)) IN ('present','half_day')) AS present_days,
    count(*) FILTER (WHERE lower(coalesce(d.manual_status, d.status)) = 'absent') AS absent_days,
    (COALESCE(sum(d.net_work_minutes), 0) / 60.0)::numeric(10,2) AS total_worked_hours,
    COALESCE(sum(d.late_by_minutes), 0)::bigint AS total_late_minutes,
    COALESCE(sum(d.early_by_minutes), 0)::bigint AS total_early_minutes,
    count(*) FILTER (WHERE COALESCE(d.late_by_minutes, 0) > 0) AS late_count,
    count(*) FILTER (WHERE COALESCE(d.early_by_minutes, 0) > 0) AS early_out_count
  FROM public.hr_attendance_daily d
  GROUP BY d.employee_id, date_trunc('month', d.attendance_date::timestamptz)
), ot AS (
  SELECT a.employee_id, date_trunc('month', a.attendance_date::timestamptz)::date AS month,
         COALESCE(sum(a.overtime_hours), 0) AS ot
  FROM public.hr_attendance a GROUP BY 1, 2
)
SELECT g.employee_id, g.month, g.present_days, g.absent_days, g.total_worked_hours,
  COALESCE(ot.ot, 0) AS total_overtime_hours,
  g.total_late_minutes, g.total_early_minutes, g.late_count, g.early_out_count
FROM g LEFT JOIN ot ON ot.employee_id = g.employee_id AND ot.month = g.month;

-- 3) HRMS summary: late/early from the calendar; staff can only read their own row.
DO $$
DECLARE src text; out text;
BEGIN
  src := pg_get_functiondef('public.hr_attendance_month_summary'::regproc);
  out := replace(src,
$a$  legacy AS (
    SELECT a.employee_id AS emp_id,
      COUNT(*) FILTER (WHERE lower(coalesce(a.attendance_status, '')) IN ('present','late'))::numeric AS present_d,
      COALESCE(SUM(a.late_minutes),0)::numeric AS late_min,
      COALESCE(SUM(a.early_leave_minutes),0)::numeric AS early_min,
      COALESCE(SUM(a.overtime_hours),0)::numeric AS ot_h
    FROM public.hr_attendance a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_elapsed_end
    GROUP BY a.employee_id
  ),$a$,
$b$  legacy AS (
    SELECT a.employee_id AS emp_id,
      COUNT(*) FILTER (WHERE lower(coalesce(a.manual_status, a.status, '')) = 'present')::numeric AS present_d,
      COALESCE(SUM(a.late_by_minutes),0)::numeric AS late_min,
      COALESCE(SUM(a.early_by_minutes),0)::numeric AS early_min,
      COALESCE((SELECT SUM(o.overtime_hours) FROM public.hr_attendance o
                 WHERE o.employee_id = a.employee_id
                   AND o.attendance_date BETWEEN v_month_start AND v_elapsed_end),0)::numeric AS ot_h
    FROM public.hr_attendance_daily a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_elapsed_end
    GROUP BY a.employee_id
  ),$b$);
  IF out = src THEN RAISE EXCEPTION 'summary legacy block not found'; END IF;
  out := replace(out, E'BEGIN\n  RETURN QUERY',
E'BEGIN\n  IF auth.uid() IS NOT NULL AND NOT (public.hr_is_hr_staff(auth.uid()) OR public.hr_can_access_payroll_data(auth.uid())) THEN\n    p_employee_ids := ARRAY(SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid() AND e.id = ANY(p_employee_ids));\n  END IF;\n  RETURN QUERY');
  IF position('p_employee_ids := ARRAY' in out) = 0 THEN RAISE EXCEPTION 'gate not inserted'; END IF;
  EXECUTE out;
END $$;