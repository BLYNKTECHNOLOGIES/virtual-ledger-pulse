
DROP TABLE IF EXISTS public._mig_role_probe;

DO $$
DECLARE
  v_secret text;
  r record;
BEGIN
  SELECT secret_value INTO v_secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';
  IF v_secret IS NULL THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.app_scheduler_secrets(name, secret_value) VALUES ('internal_cron', v_secret);
  END IF;

  FOR r IN
    SELECT jobid, command FROM cron.job
    WHERE username = current_user
      AND command ~ 'functions/v1/(auto-pay-engine|auto-price-engine|auto-reply-engine|capture-beneficiaries|risk-detection|erp-balance-snapshot|snapshot-asset-value|snapshot-daily-profit|backfill-verified-names)'
      AND command NOT ILIKE '%x-scheduler-secret%'
  LOOP
    PERFORM cron.alter_job(
      r.jobid,
      command => replace(
        r.command,
        '{"Content-Type": "application/json",',
        '{"Content-Type": "application/json", "x-scheduler-secret": "' || v_secret || '",'
      )
    );
  END LOOP;
END $$;
