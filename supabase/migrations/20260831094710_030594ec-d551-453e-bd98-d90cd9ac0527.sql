CREATE TABLE public.binance_ad_capacity_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exchange_account_id UUID NOT NULL,
  asset TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('p2p','block')),
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY','SELL')),
  max_accepted_qty NUMERIC,
  min_rejected_qty NUMERIC,
  source TEXT NOT NULL DEFAULT 'probe' CHECK (source IN ('probe','manual','learned')),
  binance_error_code TEXT,
  binance_error_message TEXT,
  needs_recalibration BOOLEAN NOT NULL DEFAULT false,
  last_probed_at TIMESTAMP WITH TIME ZONE,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (exchange_account_id, asset, zone, trade_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.binance_ad_capacity_limits TO authenticated;
GRANT ALL ON public.binance_ad_capacity_limits TO service_role;

ALTER TABLE public.binance_ad_capacity_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terminal staff can view ad capacity limits"
  ON public.binance_ad_capacity_limits FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Ad managers can insert ad capacity limits"
  ON public.binance_ad_capacity_limits FOR INSERT TO authenticated
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_ads_manage'::terminal_permission));

CREATE POLICY "Ad managers can update ad capacity limits"
  ON public.binance_ad_capacity_limits FOR UPDATE TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_ads_manage'::terminal_permission))
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_ads_manage'::terminal_permission));

CREATE POLICY "Ad managers can delete ad capacity limits"
  ON public.binance_ad_capacity_limits FOR DELETE TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_ads_manage'::terminal_permission));

CREATE TRIGGER update_binance_ad_capacity_limits_updated_at
  BEFORE UPDATE ON public.binance_ad_capacity_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.binance_ad_capacity_probe_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exchange_account_id UUID NOT NULL,
  asset TEXT NOT NULL,
  zone TEXT NOT NULL,
  trade_type TEXT NOT NULL,
  carrier_adv_no TEXT,
  attempted_qty NUMERIC NOT NULL,
  accepted BOOLEAN NOT NULL,
  response_code TEXT,
  response_message TEXT,
  run_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.binance_ad_capacity_probe_log TO authenticated;
GRANT ALL ON public.binance_ad_capacity_probe_log TO service_role;

ALTER TABLE public.binance_ad_capacity_probe_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terminal staff can view ad capacity probe log"
  ON public.binance_ad_capacity_probe_log FOR SELECT TO authenticated
  USING (true);

CREATE INDEX idx_ad_capacity_probe_log_lookup
  ON public.binance_ad_capacity_probe_log (exchange_account_id, asset, zone, trade_type, created_at DESC);