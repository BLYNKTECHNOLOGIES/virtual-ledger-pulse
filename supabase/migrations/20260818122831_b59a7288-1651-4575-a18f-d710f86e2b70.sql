-- 1) Stop notifying at insert time (the same watchdog run often auto-resolves the row).
DROP TRIGGER IF EXISTS trg_hr_notify_stale_session_open ON public.hr_attendance_stale_sessions;

-- 2) Auto-clear watchdog alerts when the session behind them gets resolved.
CREATE OR REPLACE FUNCTION public.hr_clear_watchdog_notifications_if_clean()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'open' AND NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_stale_sessions ss WHERE ss.status = 'open'
  ) THEN
    UPDATE public.hr_notifications
       SET is_read = true
     WHERE type = 'watchdog_open' AND is_read = false;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_hr_clear_watchdog_notifications ON public.hr_attendance_stale_sessions;
CREATE TRIGGER trg_hr_clear_watchdog_notifications
AFTER UPDATE OF status ON public.hr_attendance_stale_sessions
FOR EACH ROW EXECUTE FUNCTION public.hr_clear_watchdog_notifications_if_clean();

-- 3) Watchdog: notify (or clear) only after auto-resolution, based on what is really left open,
--    and report the truly-open count back to the caller.
DROP FUNCTION IF EXISTS public.hr_watchdog_open_sessions();

CREATE FUNCTION public.hr_watchdog_open_sessions()
RETURNS TABLE(opened int, refreshed int, closed int, auto_resolved int, still_open int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_opened int := 0;
  v_refreshed int := 0;
  v_closed int := 0;
  v_auto int := 0;
  v_still_open int := 0;
  v_watchdog_hours numeric := 12;
BEGIN
  SELECT COALESCE(watchdog_hours, 12) INTO v_watchdog_hours
    FROM public.hr_attendance_engine_settings LIMIT 1;
  v_watchdog_hours := COALESCE(v_watchdog_hours, 12);

  WITH stale AS (
    SELECT s.id AS session_id,
           s.employee_id,
           s.attendance_date,
           s.in_time,
           ROUND(EXTRACT(EPOCH FROM (now() - s.in_time)) / 3600.0, 2)::numeric AS hours_open
    FROM public.hr_attendance_sessions s
    WHERE s.out_time IS NULL
      AND s.in_time < now() - (v_watchdog_hours * INTERVAL '1 hour')
  ),
  upserted AS (
    INSERT INTO public.hr_attendance_stale_sessions
      (session_id, employee_id, attendance_date, in_time, hours_open, status, first_seen_at, last_seen_at)
    SELECT session_id, employee_id, attendance_date, in_time, hours_open, 'open', now(), now()
    FROM stale
    ON CONFLICT (session_id) DO UPDATE
      SET hours_open   = EXCLUDED.hours_open,
          last_seen_at = now(),
          updated_at   = now()
    RETURNING xmax = 0 AS inserted
  )
  SELECT
    COUNT(*) FILTER (WHERE inserted),
    COUNT(*) FILTER (WHERE NOT inserted)
  INTO v_opened, v_refreshed FROM upserted;

  WITH candidates AS (
    SELECT ss.session_id,
           cand.id  AS out_pid,
           cand.punch_time AS out_ts
      FROM public.hr_attendance_stale_sessions ss
      LEFT JOIN LATERAL (
        SELECT p.id, p.punch_time
          FROM public.hr_attendance_punches p
         WHERE p.employee_id = ss.employee_id
           AND p.punch_time > ss.in_time + INTERVAL '2 minutes'
           AND p.punch_time <= ss.in_time + (v_watchdog_hours * INTERVAL '1 hour')
           AND NOT EXISTS (
             SELECT 1 FROM public.hr_attendance_sessions s2 WHERE s2.in_punch_id = p.id
           )
           AND NOT (
             COALESCE(p.punch_type,'in') = 'in'
             AND public.hr_v4_window_date_of(p.punch_time) <> ss.attendance_date
           )
           AND NOT (
             public.hr_v4_window_date_of(p.punch_time) <> ss.attendance_date
             AND p.punch_time = (
               SELECT MIN(p2.punch_time) FROM public.hr_attendance_punches p2
                WHERE p2.employee_id = ss.employee_id
                  AND public.hr_v4_window_date_of(p2.punch_time)
                      = public.hr_v4_window_date_of(p.punch_time)
             )
           )
         ORDER BY p.punch_time DESC
         LIMIT 1
      ) cand ON true
     WHERE ss.status = 'open'
  ),
  session_fix AS (
    UPDATE public.hr_attendance_sessions s
       SET out_punch_id = c.out_pid,
           out_time     = c.out_ts,
           minutes      = FLOOR(EXTRACT(EPOCH FROM (c.out_ts - s.in_time)) / 60.0)::int,
           flags        = COALESCE(s.flags, '{}'::jsonb) || jsonb_build_object(
                            'auto_paired_by_watchdog', true,
                            'auto_paired_at', now()
                          ),
           updated_at   = now()
      FROM candidates c
     WHERE s.id = c.session_id
       AND c.out_pid IS NOT NULL
    RETURNING s.id
  ),
  stale_fix AS (
    UPDATE public.hr_attendance_stale_sessions ss
       SET status          = 'auto_resolved_paired_out',
           resolved_at     = now(),
           resolution_note = 'Watchdog auto-paired a later punch as OUT (' ||
                             to_char(ss.hours_open, 'FM990.00') || 'h open). Overtime suppressed.',
           updated_at      = now()
     WHERE ss.session_id IN (SELECT id FROM session_fix)
    RETURNING ss.employee_id, ss.attendance_date
  )
  SELECT COUNT(*) INTO v_auto FROM stale_fix;

  PERFORM public.hr_v4_recompute_range(x.employee_id, x.attendance_date, x.attendance_date)
    FROM (
      SELECT DISTINCT ss.employee_id, ss.attendance_date
        FROM public.hr_attendance_stale_sessions ss
       WHERE ss.status = 'auto_resolved_paired_out'
         AND ss.resolved_at > now() - INTERVAL '2 minutes'
    ) x;

  WITH closed_rows AS (
    UPDATE public.hr_attendance_stale_sessions ss
       SET status = CASE WHEN ss.status = 'open' THEN 'resolved_set_out_time' ELSE ss.status END,
           resolved_at = COALESCE(ss.resolved_at, now()),
           resolution_note = COALESCE(ss.resolution_note, 'Auto-closed by watchdog (session now closed).'),
           updated_at = now()
     WHERE ss.status = 'open'
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_sessions s
         WHERE s.id = ss.session_id AND s.out_time IS NULL
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_closed FROM closed_rows;

  SELECT COUNT(*) INTO v_still_open
    FROM public.hr_attendance_stale_sessions ss
   WHERE ss.status = 'open';

  IF v_still_open = 0 THEN
    UPDATE public.hr_notifications
       SET is_read = true
     WHERE type = 'watchdog_open' AND is_read = false;
  ELSIF NOT EXISTS (
      SELECT 1 FROM public.hr_notifications n
       WHERE n.type = 'watchdog_open'
         AND n.created_at > now() - INTERVAL '24 hours'
    ) THEN
    PERFORM public.hr_notify(
      public.hr_ops_user_ids(),
      'watchdog_open',
      'Watchdog card opened',
      v_still_open || ' stale attendance session(s) need resolution.',
      '/hrms/attendance/stale-sessions'
    );
  END IF;

  RETURN QUERY SELECT v_opened, v_refreshed, v_closed, v_auto, v_still_open;
END $function$;

GRANT EXECUTE ON FUNCTION public.hr_watchdog_open_sessions() TO service_role, authenticated;

-- 4) Clear the currently-stuck alerts (nothing is open right now).
UPDATE public.hr_notifications
   SET is_read = true
 WHERE type = 'watchdog_open'
   AND is_read = false
   AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_stale_sessions ss WHERE ss.status = 'open');
