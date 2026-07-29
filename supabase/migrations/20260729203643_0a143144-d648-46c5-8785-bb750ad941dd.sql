DO $$
BEGIN
  PERFORM cron.unschedule('hr-device-drift-estimate')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hr-device-drift-estimate');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('hr-device-clock-sync-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hr-device-clock-sync-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.hr_estimate_device_drift();

-- Sweeper keeps only the stuck-command expiry; time-sync requeue removed.
CREATE OR REPLACE FUNCTION public.hr_command_queue_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _expired int;
BEGIN
  WITH e AS (
    UPDATE public.hr_biometric_device_commands
       SET status = 'expired',
           ack_response = coalesce(ack_response,'') || ' [auto-expired >24h]'
     WHERE status = 'sent' AND sent_at < now() - interval '24 hours'
     RETURNING id
  ) SELECT count(*) INTO _expired FROM e;

  RETURN jsonb_build_object('expired', _expired, 'time_sync_requeued', 0, 'ran_at', now());
END $$;

-- Cancel any pending/sent device time-setting commands.
UPDATE public.hr_biometric_device_commands
   SET status = 'cancelled',
       ack_response = coalesce(ack_response,'') || ' [clock-sync removed; +30m ingest offset used instead]'
 WHERE status IN ('pending','sent')
   AND (command_text LIKE '%DATA UPDATE TIME=%' OR command_text LIKE '%SET TIME%');

-- Clear stale drift readings.
UPDATE public.hr_biometric_devices
   SET clock_drift_seconds = NULL,
       clock_drift_checked_at = NULL
 WHERE clock_drift_seconds IS NOT NULL OR clock_drift_checked_at IS NOT NULL;