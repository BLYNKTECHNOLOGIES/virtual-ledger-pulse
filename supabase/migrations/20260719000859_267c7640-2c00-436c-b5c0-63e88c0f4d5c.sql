SELECT net.http_post(
  url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer scheduler',
    'x-razorpay-sync-secret', (
      SELECT secret_value
        FROM public.app_scheduler_secrets
       WHERE name = 'razorpay_payslip_auto_sync'
    )
  ),
  body := jsonb_build_object(
    'action', 'import_payslip_history_range',
    'scheduled', true,
    'payload', jsonb_build_object(
      'period_from', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '24 months', 'YYYY-MM'),
      'period_to', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM'),
      'pull_from_razorpay', true
    )
  )
) AS request_id;