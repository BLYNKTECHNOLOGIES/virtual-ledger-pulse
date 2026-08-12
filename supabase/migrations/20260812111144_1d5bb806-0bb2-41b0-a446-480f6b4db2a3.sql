CREATE OR REPLACE FUNCTION public.hr_heal_no_data_absences(p_from date, p_to date, p_employee_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH cand AS (
    SELECT d.employee_id, d.attendance_date,
           to_char(d.attendance_date, 'FMday') AS dow_name,
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
  filtered AS (
    SELECT c.*
      FROM cand c
     WHERE NOT EXISTS (
             SELECT 1 FROM public.hr_holidays h
              WHERE h.date = c.attendance_date AND h.is_active = true)
       AND NOT EXISTS (
             SELECT 1 FROM public.hr_leave_requests lr
              WHERE lr.employee_id = c.employee_id
                AND lr.status = 'approved'
                AND lr.start_date <= c.attendance_date
                AND lr.end_date >= c.attendance_date)
       AND NOT EXISTS (
             SELECT 1
               FROM public.hr_employee_weekly_off w
               JOIN public.hr_weekly_off_patterns p ON p.id = w.pattern_id
              WHERE w.employee_id = c.employee_id
                AND w.is_current = true
                AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p.weekly_offs) el
                       WHERE lower(trim(both '"' from el::text)) = lower(trim(c.dow_name))
                          OR (jsonb_typeof(el) = 'number' AND el::text::int = c.dow_num)
                    ))
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
END $$;

GRANT EXECUTE ON FUNCTION public.hr_heal_no_data_absences(date, date, uuid) TO authenticated, service_role;