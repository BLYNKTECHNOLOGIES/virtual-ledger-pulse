
-- Retire legacy Clock In/Out mirror tables. Attendance is now sourced
-- exclusively from biometric punches (hr_attendance_punches) via the v4
-- engine (hr_attendance_sessions → hr_attendance_daily).

-- 1. Rewire archive_old_attendance_data to only touch biometric punches.
CREATE OR REPLACE FUNCTION public.archive_old_attendance_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date date := current_date - interval '3 months';
  punches_archived integer := 0;
BEGIN
  WITH moved AS (
    INSERT INTO hr_attendance_punches_archive (id, badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status, verified, created_at, archived_at)
    SELECT id, badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status, verified, created_at, now()
    FROM hr_attendance_punches
    WHERE punch_time < cutoff_date
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO punches_archived FROM moved;

  DELETE FROM hr_attendance_punches
  WHERE punch_time < cutoff_date
  AND id IN (SELECT id FROM hr_attendance_punches_archive);

  RETURN jsonb_build_object(
    'punches_archived', punches_archived,
    'cutoff_date', cutoff_date
  );
END;
$function$;

-- 2. Drop retired tables.
DROP TABLE IF EXISTS public.hr_attendance_activity_archive CASCADE;
DROP TABLE IF EXISTS public.hr_attendance_activity CASCADE;
