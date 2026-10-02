DO $$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.hr_attendance_month_summary'::regproc);
  v2 := replace(v, $a$  evidence AS ($a$, $a$  open_days AS (
    -- Working days where the device has an IN punch but no OUT punch (session left
    -- open), not covered by an approved correction or a stale-session hold. They
    -- are credited as attended, but must be listed as "unchecked" for HR review.
    SELECT d.employee_id AS emp_id, COUNT(*)::numeric AS n
    FROM public.hr_attendance_daily d
    WHERE d.employee_id = ANY(p_employee_ids)
      AND d.attendance_date BETWEEN v_month_start AND v_elapsed_end
      AND LOWER(COALESCE(d.manual_status, d.status, '')) = 'incomplete'
      AND public.fn_calculate_working_days(d.employee_id, d.attendance_date, d.attendance_date) > 0
      AND NOT public.hr_stale_session_held(d.employee_id, d.attendance_date)
      AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_regularization_requests rg
                      WHERE rg.employee_id = d.employee_id AND rg.attendance_date = d.attendance_date
                        AND LOWER(rg.status) = 'approved')
    GROUP BY d.employee_id
  ),
  evidence AS ($a$);
  v2 := replace(v2, $a$                - (c.half_days * 0.5))::numeric AS unverified_days,$a$,
                    $a$                - (c.half_days * 0.5))::numeric + COALESCE(od.n, 0) AS unverified_days,$a$);
  v2 := replace(v2, $a$  LEFT JOIN evidence e ON e.emp_id = c.employee_id;$a$,
                    $a$  LEFT JOIN evidence e ON e.emp_id = c.employee_id
  LEFT JOIN open_days od ON od.emp_id = c.employee_id;$a$);
  IF (length(v2) - length(v)) < 700 THEN RAISE EXCEPTION 'month summary patch did not apply fully'; END IF;
  EXECUTE v2;
END $$;