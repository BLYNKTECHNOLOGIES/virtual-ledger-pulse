CREATE TABLE IF NOT EXISTS public.terminal_ad_risk_guard_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  profile_name text NOT NULL,
  adv_nos text[] NOT NULL DEFAULT '{}',
  requested_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  skipped_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  binance_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_ad_risk_guard_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "terminal_read_ad_risk_guard_logs" ON public.terminal_ad_risk_guard_logs;
CREATE POLICY "terminal_read_ad_risk_guard_logs"
ON public.terminal_ad_risk_guard_logs
FOR SELECT
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_ads_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_audit_logs_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_automation_manage')
);

DROP POLICY IF EXISTS "service_all_ad_risk_guard_logs" ON public.terminal_ad_risk_guard_logs;
CREATE POLICY "service_all_ad_risk_guard_logs"
ON public.terminal_ad_risk_guard_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ad_risk_guard_logs_created_at
ON public.terminal_ad_risk_guard_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_risk_guard_logs_status
ON public.terminal_ad_risk_guard_logs(status);

CREATE INDEX IF NOT EXISTS idx_ad_risk_guard_logs_adv_nos
ON public.terminal_ad_risk_guard_logs USING gin(adv_nos);
