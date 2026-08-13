CREATE OR REPLACE FUNCTION public.hr_notify_on_stale_session_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
      'A stale attendance session was flagged. Resolve on the Stale Sessions page.',
      '/hrms/attendance/stale-sessions'
    );
  END IF;
  RETURN NEW;
END $$;

UPDATE public.hr_notifications
   SET link = '/hrms/attendance/stale-sessions'
 WHERE type = 'watchdog_open'
   AND link = '/hrms/attendance/watchdog';