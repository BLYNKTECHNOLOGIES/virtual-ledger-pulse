-- Reconciliation routine: rebuild hr_late_come_early_out from hr_attendance truth
CREATE OR REPLACE FUNCTION public.hr_reconcile_late_early(_from DATE, _to DATE)
RETURNS TABLE(inserted_count INT, deleted_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ins INT := 0;
  v_del INT := 0;
BEGIN
  -- Remove register rows that no longer qualify
  WITH gone AS (
    DELETE FROM public.hr_late_come_early_out l
    USING public.hr_attendance a
    WHERE l.attendance_id = a.id
      AND a.attendance_date BETWEEN _from AND _to
      AND (
        (l.type = 'late_come' AND COALESCE(a.late_minutes, 0) <= 0)
        OR (l.type = 'early_out' AND COALESCE(a.early_leave_minutes, 0) <= 0)
      )
    RETURNING l.id
  )
  SELECT count(*)::int INTO v_del FROM gone;

  -- Late comes
  WITH ins AS (
    INSERT INTO public.hr_late_come_early_out
      (attendance_id, employee_id, type, attendance_date, late_minutes, shift_id)
    SELECT a.id, a.employee_id, 'late_come', a.attendance_date, a.late_minutes, a.shift_id
    FROM public.hr_attendance a
    WHERE a.attendance_date BETWEEN _from AND _to
      AND COALESCE(a.late_minutes, 0) > 0
    ON CONFLICT (attendance_id, type) DO UPDATE
      SET late_minutes = EXCLUDED.late_minutes,
          attendance_date = EXCLUDED.attendance_date,
          shift_id = EXCLUDED.shift_id
    RETURNING 1
  )
  SELECT v_ins + count(*)::int INTO v_ins FROM ins;

  -- Early outs
  WITH ins2 AS (
    INSERT INTO public.hr_late_come_early_out
      (attendance_id, employee_id, type, attendance_date, early_minutes, shift_id)
    SELECT a.id, a.employee_id, 'early_out', a.attendance_date, a.early_leave_minutes, a.shift_id
    FROM public.hr_attendance a
    WHERE a.attendance_date BETWEEN _from AND _to
      AND COALESCE(a.early_leave_minutes, 0) > 0
    ON CONFLICT (attendance_id, type) DO UPDATE
      SET early_minutes = EXCLUDED.early_minutes,
          attendance_date = EXCLUDED.attendance_date,
          shift_id = EXCLUDED.shift_id
    RETURNING 1
  )
  SELECT v_ins + count(*)::int INTO v_ins FROM ins2;

  RETURN QUERY SELECT v_ins, v_del;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_reconcile_late_early(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_reconcile_late_early(DATE, DATE) TO authenticated, service_role;

-- One-time full backfill across all attendance history
SELECT public.hr_reconcile_late_early(
  COALESCE((SELECT min(attendance_date) FROM public.hr_attendance), CURRENT_DATE),
  COALESCE((SELECT max(attendance_date) FROM public.hr_attendance), CURRENT_DATE)
);