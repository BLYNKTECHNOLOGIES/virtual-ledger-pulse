CREATE OR REPLACE FUNCTION public.hr_compoff_auto_close_prior_months()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_month date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_month date;
  v_closed integer := 0;
  v_months date[] := '{}';
  v_n integer;
BEGIN
  FOR v_month IN
    SELECT DISTINCT date_trunc('month', credit_date)::date AS m
    FROM public.hr_compoff_credits
    WHERE settled_period_month IS NULL
      AND date_trunc('month', credit_date)::date < v_current_month
    ORDER BY 1
  LOOP
    SELECT public.hr_compoff_close_month(v_month) INTO v_n;
    v_closed := v_closed + COALESCE(v_n, 0);
    v_months := v_months || v_month;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'current_month', v_current_month,
    'months_closed', to_jsonb(v_months),
    'credits_closed', v_closed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compoff_auto_close_prior_months() TO authenticated, service_role;

SELECT cron.unschedule('hr-compoff-auto-close-prior-months')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-compoff-auto-close-prior-months');

SELECT cron.schedule(
  'hr-compoff-auto-close-prior-months',
  '30 19 1 * *',
  $$SELECT public.hr_compoff_auto_close_prior_months();$$
);