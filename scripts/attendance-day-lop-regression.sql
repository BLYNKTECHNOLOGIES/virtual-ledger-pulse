-- Read-only regression: run as postgres, without modifying attendance or payroll.
DO $$
DECLARE mismatch_count integer;
BEGIN
  IF (SELECT lop_contribution FROM public.hr_attendance_day_v
      WHERE employee_id = '7c1ab4da-f8eb-44e8-a18c-f746ffcb46cb'
        AND date = '2026-10-01') IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Oct 1: Urvashi half-day work plus paid half-day leave must have zero LOP';
  END IF;
  SELECT count(*) INTO mismatch_count FROM public.hr_attendance_day_v v
    CROSS JOIN LATERAL public.hr_lop_days_window(ARRAY[v.employee_id], v.date, v.date, v.date) w
    WHERE v.date BETWEEN '2026-10-01' AND '2026-10-20'
      AND v.lop_contribution IS DISTINCT FROM w.lop_days;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Calendar disagrees with payroll on % days', mismatch_count;
  END IF;
END $$;