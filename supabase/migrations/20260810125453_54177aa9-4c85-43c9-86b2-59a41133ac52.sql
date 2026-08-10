CREATE OR REPLACE FUNCTION public.hr_notify_on_stale_session_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only alert for a card that is actually open AND whose session is still
  -- unclosed. The hourly watchdog re-upserts every stale row on each sweep,
  -- which previously re-fired this trigger and produced a fresh unread
  -- notification every hour (818 duplicates). Throttle to one alert per day.
  IF NEW.status = 'open'
     AND EXISTS (
       SELECT 1 FROM public.hr_attendance_sessions s
        WHERE s.id = NEW.session_id AND s.out_time IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_notifications n
        WHERE n.type = 'watchdog_open'
          AND n.created_at > now() - INTERVAL '24 hours'
     )
  THEN
    PERFORM public.hr_notify(
      public.hr_ops_user_ids(),
      'watchdog_open',
      'Watchdog card opened',
      'A stale attendance session was flagged. Resolve on the Attendance Watchdog page.',
      '/hrms/attendance/watchdog'
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hr_mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  WITH upd AS (
    UPDATE public.hr_notifications
       SET is_read = true
     WHERE user_id = auth.uid() AND is_read = false
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.hr_mark_all_notifications_read() TO authenticated;