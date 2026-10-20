DO $migration$
DECLARE
  v_def text := pg_get_viewdef('public.hr_attendance_day_v'::regclass, true);
  v_before text;
  v_after text;
  v_old text;
  v_count int;
BEGIN
  v_before := substring(v_def from '        CASE\n            WHEN hr_is_holiday\(attendance_date\) AND first_in IS NULL THEN 0::numeric[\s\S]*?        END AS lop_contribution');
  IF v_before IS NULL THEN RAISE EXCEPTION 'Attendance LOP view does not match expected definition'; END IF;
  v_def := replace(v_def, v_before, '    COALESCE(day_lop.lop_days, 0::numeric) AS lop_contribution');
  v_def := replace(v_def, 'ELSE COALESCE(status, ''no_data''::text)', 'ELSE COALESCE(manual_status, status, ''no_data''::text)');
  v_old := 'FROM hr_attendance_daily d;';
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'Attendance view source does not match'; END IF;
  v_def := replace(v_def, v_old, 'FROM public.hr_attendance_daily d
    LEFT JOIN LATERAL (SELECT w.lop_days FROM public.hr_lop_days_window(ARRAY[d.employee_id]::uuid[], d.attendance_date, d.attendance_date, d.attendance_date) w) day_lop ON true;');
  EXECUTE 'CREATE OR REPLACE VIEW public.hr_attendance_day_v AS ' || v_def;
  SELECT count(*) INTO v_count FROM public.hr_attendance_day_v v
    CROSS JOIN LATERAL public.hr_lop_days_window(ARRAY[v.employee_id], v.date, v.date, v.date) w
    WHERE v.date BETWEEN '2026-10-01' AND '2026-10-20' AND v.lop_contribution IS DISTINCT FROM w.lop_days;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Calendar and payroll day LOP differ for % October rows', v_count; END IF;
  IF (SELECT lop_contribution FROM public.hr_attendance_day_v WHERE employee_id='7c1ab4da-f8eb-44e8-a18c-f746ffcb46cb' AND date='2026-10-01') IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Urvashi Oct 1 paid half-day must have zero LOP';
  END IF;
END
$migration$;