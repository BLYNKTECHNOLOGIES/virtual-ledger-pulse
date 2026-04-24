CREATE TABLE public.payer_screenshot_automation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric NOT NULL DEFAULT 0,
  from_name text NOT NULL DEFAULT 'Blynk Virtual Technologies Pvt. Ltd.',
  from_upi_id text NOT NULL DEFAULT 'blynkex@aeronflyprivatelimited',
  provider_fee_flat numeric NOT NULL DEFAULT 10,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.payer_screenshot_automation_config (is_active) VALUES (false);

ALTER TABLE public.payer_screenshot_automation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view auto-screenshot config"
  ON public.payer_screenshot_automation_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/managers can update auto-screenshot config"
  ON public.payer_screenshot_automation_config
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.user_has_permission(auth.uid(), 'terminal_manage'::app_permission)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.user_has_permission(auth.uid(), 'terminal_manage'::app_permission)
  );

CREATE TRIGGER trg_update_auto_screenshot_config_updated_at
  BEFORE UPDATE ON public.payer_screenshot_automation_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payer_screenshot_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  payer_user_id uuid,
  payer_name text,
  amount_used integer,
  provider_fee numeric,
  total_debited numeric,
  to_upi_id text,
  upi_txn_id text,
  status text NOT NULL,
  error_message text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payer_screenshot_log_created_at
  ON public.payer_screenshot_automation_log (created_at DESC);

ALTER TABLE public.payer_screenshot_automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view auto-screenshot log"
  ON public.payer_screenshot_automation_log
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.payer_screenshot_automation_log REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payer_screenshot_automation_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payer_screenshot_automation_config;