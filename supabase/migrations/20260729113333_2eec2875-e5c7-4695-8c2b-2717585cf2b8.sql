
-- 1. Config columns on device row
ALTER TABLE public.hr_biometric_devices
  ADD COLUMN IF NOT EXISTS clock_offset_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clock_offset_reason text,
  ADD COLUMN IF NOT EXISTS clock_offset_updated_at timestamptz;

COMMENT ON COLUMN public.hr_biometric_devices.clock_offset_minutes IS
  'Minutes to ADD to every raw punch string received from this device before storing. Used when the physical device clock is stuck at the wrong offset (e.g. UTC+5 instead of UTC+5:30 → +30). Set to 0 once the device clock is physically corrected.';

-- 2. Seed the two current ESSL devices with +30 min correction
UPDATE public.hr_biometric_devices
   SET clock_offset_minutes = 30,
       clock_offset_reason  = 'Device clock stuck at UTC+5 instead of UTC+5:30; +30 min correction applied at ingest',
       clock_offset_updated_at = now()
 WHERE device_serial IN ('ZHM2255300863','QJT3242100429');

-- 3. Backfill audit log (idempotency guard)
CREATE TABLE IF NOT EXISTS public.hr_attendance_offset_backfill_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL,
  target_table text NOT NULL,
  offset_minutes integer NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  rows_shifted integer NOT NULL DEFAULT 0,
  rows_skipped_conflict integer NOT NULL DEFAULT 0,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text,
  UNIQUE (device_serial, target_table, window_start, window_end, offset_minutes)
);

GRANT SELECT ON public.hr_attendance_offset_backfill_log TO authenticated;
GRANT ALL ON public.hr_attendance_offset_backfill_log TO service_role;
ALTER TABLE public.hr_attendance_offset_backfill_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offset backfill log readable by authenticated"
  ON public.hr_attendance_offset_backfill_log FOR SELECT TO authenticated USING (true);

-- 4. Backfill: shift historical rows for the two affected serials from 2026-07-01
DO $$
DECLARE
  v_serials text[] := ARRAY['ZHM2255300863','QJT3242100429'];
  v_offset int := 30;
  v_start timestamptz := '2026-07-01 00:00:00+05:30';
  v_end   timestamptz := now();
  v_serial text;
  v_shifted int;
  v_skipped int;
BEGIN
  FOREACH v_serial IN ARRAY v_serials LOOP

    -- hr_attendance_punches — respect unique (employee_id, punch_time, punch_type)
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_attendance_offset_backfill_log
      WHERE device_serial = v_serial
        AND target_table = 'hr_attendance_punches'
        AND window_start = v_start AND window_end <= v_end AND offset_minutes = v_offset
    ) THEN
      WITH candidates AS (
        SELECT id, employee_id, punch_time, punch_type,
               punch_time + make_interval(mins => v_offset) AS new_time
          FROM public.hr_attendance_punches
         WHERE device_serial = v_serial
           AND punch_time >= v_start
      ),
      collisions AS (
        SELECT c.id
          FROM candidates c
          JOIN public.hr_attendance_punches p
            ON p.employee_id = c.employee_id
           AND p.punch_type  = c.punch_type
           AND p.punch_time  = c.new_time
           AND p.id <> c.id
      ),
      to_delete AS (
        DELETE FROM public.hr_attendance_punches
         WHERE id IN (SELECT id FROM collisions)
         RETURNING id
      ),
      shifted AS (
        UPDATE public.hr_attendance_punches p
           SET punch_time = c.new_time
          FROM candidates c
         WHERE p.id = c.id
           AND c.id NOT IN (SELECT id FROM collisions)
         RETURNING p.id
      )
      SELECT (SELECT count(*) FROM shifted), (SELECT count(*) FROM to_delete)
        INTO v_shifted, v_skipped;

      INSERT INTO public.hr_attendance_offset_backfill_log
        (device_serial, target_table, offset_minutes, window_start, window_end, rows_shifted, rows_skipped_conflict, applied_by)
      VALUES (v_serial, 'hr_attendance_punches', v_offset, v_start, v_end, v_shifted, v_skipped, 'clock_offset_migration');
    END IF;

    -- hr_attendance_punches_archive
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_attendance_offset_backfill_log
      WHERE device_serial = v_serial
        AND target_table = 'hr_attendance_punches_archive'
        AND window_start = v_start AND window_end <= v_end AND offset_minutes = v_offset
    ) THEN
      UPDATE public.hr_attendance_punches_archive
         SET punch_time = punch_time + make_interval(mins => v_offset)
       WHERE device_serial = v_serial
         AND punch_time >= v_start;
      GET DIAGNOSTICS v_shifted = ROW_COUNT;
      INSERT INTO public.hr_attendance_offset_backfill_log
        (device_serial, target_table, offset_minutes, window_start, window_end, rows_shifted, rows_skipped_conflict, applied_by)
      VALUES (v_serial, 'hr_attendance_punches_archive', v_offset, v_start, v_end, v_shifted, 0, 'clock_offset_migration');
    END IF;

    -- hr_attendance_quarantine — respect unique (device_serial, pin, punch_time)
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_attendance_offset_backfill_log
      WHERE device_serial = v_serial
        AND target_table = 'hr_attendance_quarantine'
        AND window_start = v_start AND window_end <= v_end AND offset_minutes = v_offset
    ) THEN
      WITH candidates AS (
        SELECT id, device_serial, pin, punch_time,
               punch_time + make_interval(mins => v_offset) AS new_time
          FROM public.hr_attendance_quarantine
         WHERE device_serial = v_serial
           AND punch_time >= v_start
      ),
      collisions AS (
        SELECT c.id FROM candidates c
          JOIN public.hr_attendance_quarantine q
            ON q.device_serial = c.device_serial
           AND q.pin = c.pin
           AND q.punch_time = c.new_time
           AND q.id <> c.id
      ),
      to_delete AS (
        DELETE FROM public.hr_attendance_quarantine WHERE id IN (SELECT id FROM collisions) RETURNING id
      ),
      shifted AS (
        UPDATE public.hr_attendance_quarantine q
           SET punch_time = c.new_time
          FROM candidates c
         WHERE q.id = c.id
           AND c.id NOT IN (SELECT id FROM collisions)
         RETURNING q.id
      )
      SELECT (SELECT count(*) FROM shifted), (SELECT count(*) FROM to_delete)
        INTO v_shifted, v_skipped;

      INSERT INTO public.hr_attendance_offset_backfill_log
        (device_serial, target_table, offset_minutes, window_start, window_end, rows_shifted, rows_skipped_conflict, applied_by)
      VALUES (v_serial, 'hr_attendance_quarantine', v_offset, v_start, v_end, v_shifted, v_skipped, 'clock_offset_migration');
    END IF;

    -- hr_biometric_device_operlog
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_attendance_offset_backfill_log
      WHERE device_serial = v_serial
        AND target_table = 'hr_biometric_device_operlog'
        AND window_start = v_start AND window_end <= v_end AND offset_minutes = v_offset
    ) THEN
      UPDATE public.hr_biometric_device_operlog
         SET occurred_at = occurred_at + make_interval(mins => v_offset)
       WHERE device_serial = v_serial
         AND occurred_at >= v_start;
      GET DIAGNOSTICS v_shifted = ROW_COUNT;
      INSERT INTO public.hr_attendance_offset_backfill_log
        (device_serial, target_table, offset_minutes, window_start, window_end, rows_shifted, rows_skipped_conflict, applied_by)
      VALUES (v_serial, 'hr_biometric_device_operlog', v_offset, v_start, v_end, v_shifted, 0, 'clock_offset_migration');
    END IF;

  END LOOP;
END $$;

-- 5. Recompute pre-cutover daily attendance for every employee touched by the shift
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT employee_id
      FROM public.hr_attendance_punches
     WHERE device_serial IN ('ZHM2255300863','QJT3242100429')
       AND punch_time >= '2026-07-01'
       AND employee_id IS NOT NULL
  LOOP
    PERFORM public.hr_rebuild_attendance_daily_range(
      r.employee_id,
      '2026-07-01'::date,
      (now() AT TIME ZONE 'Asia/Kolkata')::date
    );
  END LOOP;
END $$;
