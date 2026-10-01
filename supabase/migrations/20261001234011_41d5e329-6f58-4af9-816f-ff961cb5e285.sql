-- Invoke the LWD access sweep with the existing private scheduler secret, not a public anonymous JWT.
CREATE OR REPLACE FUNCTION public.hr_call_lwd_access_sweep()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT secret_value INTO v_secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE EXCEPTION 'internal_cron scheduler secret is not configured';
  END IF;
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-auto-deactivate-separated',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-scheduler-secret', v_secret),
    body := '{"scheduled":true}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_call_lwd_access_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_call_lwd_access_sweep() TO postgres, service_role;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hr-auto-deactivate-separated';
SELECT cron.schedule('hr-auto-deactivate-separated', '30 19 * * *', $$SELECT public.hr_call_lwd_access_sweep();$$);

-- A recorded payment must never precede the verified payroll-input state.
CREATE OR REPLACE FUNCTION public.fn_enforce_fnf_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('calculated', 'cancelled')) OR
      (OLD.status = 'calculated' AND NEW.status IN ('approved', 'cancelled')) OR
      (OLD.status = 'approved' AND NEW.status = 'paid')
    ) THEN
      RAISE EXCEPTION 'Invalid FnF status transition: % → %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'approved' AND (NEW.approved_by IS NULL OR NEW.approved_by = '') THEN
      RAISE EXCEPTION 'approved_by is required when approving FnF settlement';
    END IF;
    IF NEW.status = 'paid' THEN
      IF NULLIF(trim(NEW.payment_reference), '') IS NULL THEN
        RAISE EXCEPTION 'payment_reference is required when marking FnF as paid';
      END IF;
      IF NEW.razorpay_push_status NOT IN ('pushed', 'nothing_to_push') OR NEW.razorpay_push_status IS NULL THEN
        RAISE EXCEPTION 'Cannot mark FnF paid until RazorpayX inputs are verified or nothing is due';
      END IF;
      IF NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;