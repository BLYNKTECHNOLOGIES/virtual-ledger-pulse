
-- ============================================================================
-- F5 · Biometric device clock-sync + command-queue sweeper
-- ============================================================================
ALTER TABLE public.hr_biometric_devices
  ADD COLUMN IF NOT EXISTS clock_drift_seconds int,
  ADD COLUMN IF NOT EXISTS clock_drift_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_time_sync_at timestamptz;

-- Estimate drift = latest punch_time - now(); computed from the last 2 h of
-- punches so an offline device does not falsely appear synced.
CREATE OR REPLACE FUNCTION public.hr_estimate_device_drift()
RETURNS TABLE(device_serial text, drift_seconds int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT d.device_serial FROM public.hr_biometric_devices d WHERE d.device_serial IS NOT NULL
  LOOP
    UPDATE public.hr_biometric_devices d
       SET clock_drift_seconds =
             (SELECT EXTRACT(EPOCH FROM (max(p.punch_time) - now()))::int
                FROM public.hr_attendance_punches p
               WHERE p.device_serial = r.device_serial
                 AND p.punch_time > now() - interval '2 hours'),
           clock_drift_checked_at = now()
     WHERE d.device_serial = r.device_serial;
    device_serial := r.device_serial;
    SELECT d.clock_drift_seconds INTO drift_seconds
      FROM public.hr_biometric_devices d WHERE d.device_serial = r.device_serial;
    RETURN NEXT;
  END LOOP;
END $$;

-- Sweeper: expire commands stuck in 'sent' >24h, requeue idempotent SET_TIME
-- so the ordering foundation of the whole engine is actively protected.
CREATE OR REPLACE FUNCTION public.hr_command_queue_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _expired int; _requeued int;
BEGIN
  WITH e AS (
    UPDATE public.hr_biometric_device_commands
       SET status = 'expired',
           ack_response = coalesce(ack_response,'') || ' [auto-expired >24h]'
     WHERE status = 'sent' AND sent_at < now() - interval '24 hours'
     RETURNING id
  ) SELECT count(*) INTO _expired FROM e;

  WITH ins AS (
    INSERT INTO public.hr_biometric_device_commands (device_serial, command_text, status)
    SELECT d.device_serial,
           'DATA UPDATE TIME=' || to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS'),
           'pending'
      FROM public.hr_biometric_devices d
     WHERE d.device_serial IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_biometric_device_commands c
          WHERE c.device_serial = d.device_serial
            AND c.command_text LIKE 'DATA UPDATE TIME=%'
            AND c.status IN ('pending','sent')
       )
    RETURNING id
  ) SELECT count(*) INTO _requeued FROM ins;

  UPDATE public.hr_biometric_devices d
     SET last_time_sync_at = now()
   WHERE EXISTS (
     SELECT 1 FROM public.hr_biometric_device_commands c
      WHERE c.device_serial = d.device_serial
        AND c.command_text LIKE 'DATA UPDATE TIME=%'
        AND c.status = 'pending'
        AND c.created_at > now() - interval '2 minutes'
   );

  RETURN jsonb_build_object(
    'expired', _expired,
    'time_sync_requeued', _requeued,
    'ran_at', now()
  );
END $$;

-- Cron: drift estimator every 30 min
DO $$
BEGIN
  PERFORM cron.unschedule('hr-device-drift-estimate')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hr-device-drift-estimate');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'hr-device-drift-estimate',
  '*/30 * * * *',
  $$SELECT public.hr_estimate_device_drift();$$
);

-- Cron: daily 03:00 IST (21:30 UTC) time-sync + queue sweep
DO $$
BEGIN
  PERFORM cron.unschedule('hr-device-clock-sync-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hr-device-clock-sync-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'hr-device-clock-sync-daily',
  '30 21 * * *',
  $$SELECT public.hr_command_queue_sweep();$$
);

-- ============================================================================
-- F4 · Attendance-correction validator (propose-and-validate doctrine)
-- ============================================================================
ALTER TABLE public.hr_attendance_regularization_requests
  ADD COLUMN IF NOT EXISTS evidence_status text,
  ADD COLUMN IF NOT EXISTS evidence_payload jsonb,
  ADD COLUMN IF NOT EXISTS override_admin_id uuid,
  ADD COLUMN IF NOT EXISTS override_reason text;

COMMENT ON COLUMN public.hr_attendance_regularization_requests.evidence_status IS
  'evidence_ok = matches raw punch; unsupported_override = admin approved against evidence';

CREATE OR REPLACE FUNCTION public.hr_validate_regularization_proposal(
  _employee_id uuid,
  _date date,
  _proposed_in timestamptz,
  _proposed_out timestamptz,
  _window_minutes int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _match_in uuid; _match_in_time timestamptz;
  _match_out uuid; _match_out_time timestamptz;
  _conflict boolean := false;
  _day_punches jsonb;
BEGIN
  IF _proposed_in IS NOT NULL THEN
    SELECT id, punch_time INTO _match_in, _match_in_time
      FROM public.hr_attendance_punches
     WHERE employee_id = _employee_id
       AND abs(EXTRACT(EPOCH FROM (punch_time - _proposed_in))) <= _window_minutes*60
     ORDER BY abs(EXTRACT(EPOCH FROM (punch_time - _proposed_in))) ASC
     LIMIT 1;
  END IF;

  IF _proposed_out IS NOT NULL THEN
    SELECT id, punch_time INTO _match_out, _match_out_time
      FROM public.hr_attendance_punches
     WHERE employee_id = _employee_id
       AND abs(EXTRACT(EPOCH FROM (punch_time - _proposed_out))) <= _window_minutes*60
     ORDER BY abs(EXTRACT(EPOCH FROM (punch_time - _proposed_out))) ASC
     LIMIT 1;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hr_attendance_sessions s
     WHERE s.employee_id = _employee_id
       AND s.attendance_date = _date
       AND (
         (_proposed_in IS NOT NULL AND _proposed_in BETWEEN s.in_time AND coalesce(s.out_time, s.in_time + interval '12 hours'))
         OR (_proposed_out IS NOT NULL AND _proposed_out BETWEEN s.in_time AND coalesce(s.out_time, s.in_time + interval '12 hours'))
       )
  ) INTO _conflict;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'punch_time', punch_time,
    'device_serial', device_serial,
    'effective', effective,
    'suppressed_reason', suppressed_reason
  ) ORDER BY punch_time)
  INTO _day_punches
  FROM public.hr_attendance_punches
  WHERE employee_id = _employee_id
    AND punch_time >= _date::timestamptz - interval '4 hours'
    AND punch_time <  (_date + 1)::timestamptz + interval '8 hours';

  RETURN jsonb_build_object(
    'evidence_ok',
      ((_proposed_in  IS NULL OR _match_in  IS NOT NULL)
       AND (_proposed_out IS NULL OR _match_out IS NOT NULL)
       AND NOT _conflict),
    'matched_in_punch_id',  _match_in,
    'matched_in_time',      _match_in_time,
    'matched_out_punch_id', _match_out,
    'matched_out_time',     _match_out_time,
    'conflict_with_existing_session', _conflict,
    'window_minutes', _window_minutes,
    'day_punches', coalesce(_day_punches, '[]'::jsonb)
  );
END $$;

-- ============================================================================
-- F7 · Notification writers — the system informs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hr_notify(
  _user_ids uuid[],
  _kind text,
  _title text,
  _message text,
  _link text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _inserted int;
BEGIN
  WITH ins AS (
    INSERT INTO public.hr_notifications (user_id, type, title, message, link, is_read, created_at)
    SELECT u, _kind, _title, _message, _link, false, now()
      FROM unnest(_user_ids) u
     WHERE u IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_notification_preferences p
          WHERE p.employee_id = u
            AND p.notification_type = _kind
            AND p.is_enabled = false
       )
    RETURNING id
  )
  SELECT count(*) INTO _inserted FROM ins;
  RETURN COALESCE(_inserted, 0);
END $$;

-- HR-ops recipient set = users with HR / Super Admin roles
CREATE OR REPLACE FUNCTION public.hr_ops_user_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::uuid[])
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
   WHERE r.name IN ('Super Admin','Admin','HR','HR Manager','HR Head');
$$;

-- Trigger: notify HR ops when a stale-session card is opened
CREATE OR REPLACE FUNCTION public.hr_notify_on_stale_session_open()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open' THEN
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
DROP TRIGGER IF EXISTS trg_hr_notify_stale_session_open ON public.hr_attendance_stale_sessions;
CREATE TRIGGER trg_hr_notify_stale_session_open
  AFTER INSERT ON public.hr_attendance_stale_sessions
  FOR EACH ROW EXECUTE FUNCTION public.hr_notify_on_stale_session_open();

-- Trigger: notify HR ops when a drift alert opens (or re-opens)
CREATE OR REPLACE FUNCTION public.hr_notify_on_drift_alert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.resolved_at IS NULL)
     OR (TG_OP = 'UPDATE' AND OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS NULL) THEN
    PERFORM public.hr_notify(
      public.hr_ops_user_ids(),
      'drift_alert',
      format('Drift alert · %s', NEW.field),
      format('%s — HRMS "%s" vs RazorpayX "%s"',
             NEW.field,
             COALESCE(NEW.hrms_value,'—'),
             COALESCE(NEW.razorpay_value,'—')),
      '/hrms/data-health'
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_notify_drift_alert ON public.hr_drift_alerts;
CREATE TRIGGER trg_hr_notify_drift_alert
  AFTER INSERT OR UPDATE ON public.hr_drift_alerts
  FOR EACH ROW EXECUTE FUNCTION public.hr_notify_on_drift_alert();

-- Trigger: notify employee on leave decision (approved/rejected)
CREATE OR REPLACE FUNCTION public.hr_notify_on_leave_decision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','rejected') THEN
    SELECT user_id INTO _uid FROM public.hr_employees WHERE id = NEW.employee_id;
    IF _uid IS NOT NULL THEN
      PERFORM public.hr_notify(
        ARRAY[_uid],
        'leave_' || NEW.status,
        format('Leave %s', NEW.status),
        format('Your leave request from %s was %s.',
               to_char(NEW.start_date,'DD Mon YYYY'),
               NEW.status),
        '/employee/leaves'
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_notify_leave_decision ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_notify_leave_decision
  AFTER UPDATE OF status ON public.hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_notify_on_leave_decision();

-- ============================================================================
-- Extend System Pulse: clock-drift + interventions this month
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hr_system_pulse()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, cron, extensions
AS $$
DECLARE
  _cron JSONB; _email JSONB; _devices JSONB; _drift JSONB;
  _stale JSONB; _sandbox JSONB; _rz JSONB;
  _clock JSONB; _interv JSONB;
BEGIN
  BEGIN
    SELECT jsonb_agg(row_to_json(x)) INTO _cron FROM (
      SELECT j.jobname, j.schedule, j.active,
             r.status AS last_status,
             r.start_time AS last_run_at,
             EXTRACT(EPOCH FROM (now() - r.start_time))::int AS seconds_since
        FROM cron.job j
        LEFT JOIN LATERAL (
          SELECT status, start_time FROM cron.job_run_details d
           WHERE d.jobid = j.jobid
           ORDER BY d.start_time DESC NULLS LAST LIMIT 1
        ) r ON true
       WHERE j.jobname LIKE 'hr-%' OR j.jobname LIKE 'razorpay-%'
          OR j.jobname LIKE 'auto-%' OR j.jobname LIKE 'dispatch-%'
          OR j.jobname LIKE 'biometric-%'
       ORDER BY j.jobname
    ) x;
  EXCEPTION WHEN OTHERS THEN _cron := '[]'::jsonb; END;

  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status='pending'),
    'failed_24h', COUNT(*) FILTER (WHERE status='failed' AND created_at > now() - interval '24 hours'),
    'sent_24h', COUNT(*) FILTER (WHERE status='sent' AND created_at > now() - interval '24 hours'),
    'oldest_pending_age_min', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status='pending')))/60,0)::int
  ) INTO _email
    FROM public.hr_email_send_log
   WHERE created_at > now() - interval '7 days';

  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status IN ('pending','queued')),
    'oldest_pending_age_min', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status IN ('pending','queued'))))/60,0)::int,
    'failed_24h', COUNT(*) FILTER (WHERE status='failed' AND created_at > now() - interval '24 hours')
  ) INTO _devices
    FROM public.hr_biometric_device_commands;

  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE resolved_at IS NULL),
    'critical_open', COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity='critical')
  ) INTO _drift FROM public.hr_drift_alerts;

  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE resolved_at IS NULL),
    'oldest_age_hours', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE resolved_at IS NULL)))/3600,0)::int
  ) INTO _stale FROM public.hr_attendance_stale_sessions;

  BEGIN
    SELECT jsonb_build_object('enabled', COALESCE(sandbox_mode,false), 'expires_at', sandbox_expires_at)
      INTO _sandbox FROM public.hr_razorpay_settings LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _sandbox := jsonb_build_object('enabled', false); END;

  BEGIN
    SELECT to_jsonb(f) INTO _rz FROM public.hr_razorpay_payroll_freshness f LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _rz := '{}'::jsonb; END;

  -- F5: clock-drift summary across all devices
  SELECT jsonb_build_object(
    'total_devices', COUNT(*),
    'max_drift_seconds', COALESCE(MAX(abs(clock_drift_seconds)),0),
    'devices_over_30s', COUNT(*) FILTER (WHERE abs(clock_drift_seconds) > 30),
    'devices_over_120s', COUNT(*) FILTER (WHERE abs(clock_drift_seconds) > 120),
    'last_time_sync_at', MAX(last_time_sync_at),
    'oldest_since_sync_hours', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(last_time_sync_at)))/3600,0)::int,
    'per_device', COALESCE(jsonb_agg(jsonb_build_object(
       'device_serial', device_serial, 'name', name,
       'drift_seconds', clock_drift_seconds, 'last_sync_at', last_time_sync_at,
       'checked_at', clock_drift_checked_at) ORDER BY abs(coalesce(clock_drift_seconds,0)) DESC), '[]'::jsonb)
  ) INTO _clock FROM public.hr_biometric_devices WHERE device_serial IS NOT NULL;

  -- F4: interventions this month + unsupported override count
  SELECT jsonb_build_object(
    'this_month', COUNT(*),
    'unsupported_overrides_this_month', COUNT(*) FILTER (
      WHERE payload->>'evidence_status' = 'unsupported_override'
    )
  ) INTO _interv
    FROM public.hr_attendance_intervention_log
   WHERE created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'generated_at', now(),
    'cron', COALESCE(_cron, '[]'::jsonb),
    'email', COALESCE(_email, '{}'::jsonb),
    'devices', COALESCE(_devices, '{}'::jsonb),
    'drift', COALESCE(_drift, '{}'::jsonb),
    'stale_sessions', COALESCE(_stale, '{}'::jsonb),
    'sandbox', COALESCE(_sandbox, '{}'::jsonb),
    'razorpay_freshness', COALESCE(_rz, '{}'::jsonb),
    'clock', COALESCE(_clock, '{}'::jsonb),
    'interventions', COALESCE(_interv, '{}'::jsonb)
  );
END $$;

-- Grants (functions are SECURITY DEFINER so grants just permit invocation)
GRANT EXECUTE ON FUNCTION public.hr_estimate_device_drift()                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_command_queue_sweep()                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_validate_regularization_proposal(uuid,date,timestamptz,timestamptz,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_notify(uuid[], text, text, text, text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_ops_user_ids()                                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_system_pulse()                                     TO authenticated, service_role;
