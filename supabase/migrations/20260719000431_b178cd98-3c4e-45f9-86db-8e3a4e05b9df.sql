CREATE OR REPLACE FUNCTION public.hr_trigger_razorpay_payslip_history_restore(
  p_period_from text DEFAULT to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '24 months', 'YYYY-MM'),
  p_period_to text DEFAULT to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM')
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_request_id bigint;
  v_secret text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.user_has_permission(auth.uid(), 'hr_payroll')
    OR public.user_has_permission(auth.uid(), 'hr_payroll_manage')
    OR public.user_has_permission(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Insufficient permission';
  END IF;

  IF p_period_from !~ '^\d{4}-\d{2}$' OR p_period_to !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Period range must use YYYY-MM';
  END IF;

  SELECT secret_value INTO v_secret
  FROM public.app_scheduler_secrets
  WHERE name = 'razorpay_payslip_auto_sync';

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Razorpay scheduler secret is not configured';
  END IF;

  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer scheduler',
      'x-razorpay-sync-secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'import_payslip_history_range',
      'scheduled', true,
      'payload', jsonb_build_object(
        'period_from', p_period_from,
        'period_to', p_period_to,
        'pull_from_razorpay', true
      )
    )
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_trigger_razorpay_payslip_history_restore(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_trigger_razorpay_payslip_history_restore(text, text) TO service_role;