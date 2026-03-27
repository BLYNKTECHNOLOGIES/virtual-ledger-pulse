-- Function to archive old attendance data (>3 months)
CREATE OR REPLACE FUNCTION public.archive_old_attendance_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date date := current_date - interval '3 months';
  punches_archived integer := 0;
  activity_archived integer := 0;
BEGIN
  -- Archive punches older than 3 months
  WITH moved AS (
    INSERT INTO hr_attendance_punches_archive (id, badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status, verified, created_at, archived_at)
    SELECT id, badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status, verified, created_at, now()
    FROM hr_attendance_punches
    WHERE punch_time < cutoff_date
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO punches_archived FROM moved;

  -- Delete archived punches from main table
  DELETE FROM hr_attendance_punches
  WHERE punch_time < cutoff_date
  AND id IN (SELECT id FROM hr_attendance_punches_archive);

  -- Archive activity older than 3 months
  WITH moved AS (
    INSERT INTO hr_attendance_activity_archive (id, employee_id, activity_date, clock_in, clock_out, clock_in_note, clock_out_note, created_at, archived_at)
    SELECT id, employee_id, activity_date, clock_in, clock_out, clock_in_note, clock_out_note, created_at, now()
    FROM hr_attendance_activity
    WHERE activity_date < cutoff_date
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO activity_archived FROM moved;

  -- Delete archived activity from main table
  DELETE FROM hr_attendance_activity
  WHERE activity_date < cutoff_date
  AND id IN (SELECT id FROM hr_attendance_activity_archive);

  RETURN jsonb_build_object(
    'punches_archived', punches_archived,
    'activity_archived', activity_archived,
    'cutoff_date', cutoff_date
  );
END;
$$;

-- Ensure archive tables have unique constraint on id for ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_attendance_punches_archive_pkey') THEN
    ALTER TABLE hr_attendance_punches_archive ADD PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_attendance_activity_archive_pkey') THEN
    ALTER TABLE hr_attendance_activity_archive ADD PRIMARY KEY (id);
  END IF;
END $$;