
-- eSSL pushback audit log — mirrors hr_razorpay_pushback_log.
CREATE TABLE IF NOT EXISTS public.hr_essl_pushback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  device_serial text,
  pin text,
  kind text NOT NULL,          -- 'identity' | 'delete' | 'disable'
  action text NOT NULL,        -- 'DATA UPDATE USERINFO' | 'DATA DELETE USERINFO'
  status text NOT NULL,        -- 'queued' | 'sent' | 'ack' | 'error' | 'skipped'
  command_id uuid REFERENCES public.hr_biometric_device_commands(id) ON DELETE SET NULL,
  request_snapshot jsonb,
  response_snapshot jsonb,
  error_message text,
  triggered_by uuid,
  triggered_from text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_essl_pushback_log_emp ON public.hr_essl_pushback_log(hr_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_essl_pushback_log_cmd ON public.hr_essl_pushback_log(command_id);

GRANT SELECT ON public.hr_essl_pushback_log TO authenticated;
GRANT ALL ON public.hr_essl_pushback_log TO service_role;

ALTER TABLE public.hr_essl_pushback_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read essl pushback"
  ON public.hr_essl_pushback_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service manages essl pushback"
  ON public.hr_essl_pushback_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
