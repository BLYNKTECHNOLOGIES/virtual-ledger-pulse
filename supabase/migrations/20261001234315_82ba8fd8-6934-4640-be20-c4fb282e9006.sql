-- Retire the older 00:15 IST account-deletion job. The authenticated 01:00 IST
-- access sweep is the sole automatic owner of ERP/biometric cutoff.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hr-auto-account-deletion-daily';

-- Keep the legacy callable RPC safe as well: disable access, never destroy
-- login identity, roles or audit linkage during separation.
CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp record;
  v_disabled int := 0;
  v_errors text[] := '{}';
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  FOR emp IN
    SELECT id, user_id, badge_id, last_working_day
    FROM public.hr_employees
    WHERE last_working_day < v_today
      AND resignation_status IN ('notice_period', 'completed')
  LOOP
    BEGIN
      IF emp.user_id IS NOT NULL THEN
        UPDATE public.users SET status = 'INACTIVE', force_logout_at = now(), updated_at = now()
        WHERE id = emp.user_id AND status IS DISTINCT FROM 'INACTIVE';
        v_disabled := v_disabled + 1;
      END IF;
      UPDATE public.hr_employees
      SET is_active = false, resignation_status = 'completed'
      WHERE id = emp.id AND (is_active OR resignation_status = 'notice_period');
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, COALESCE(emp.badge_id, emp.id::text) || ': ' || SQLERRM);
    END;
  END LOOP;
  RETURN json_build_object('disabled_count', v_disabled, 'errors', v_errors, 'processed_at', now());
END;
$$;