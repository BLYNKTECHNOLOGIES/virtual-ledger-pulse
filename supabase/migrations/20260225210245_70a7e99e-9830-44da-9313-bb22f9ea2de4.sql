
-- Auto Pricing Engine tables

CREATE TABLE public.ad_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  asset text NOT NULL DEFAULT 'USDT',
  fiat text NOT NULL DEFAULT 'INR',
  trade_type text NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  price_type text NOT NULL CHECK (price_type IN ('FIXED', 'FLOATING')),
  target_merchant text NOT NULL,
  fallback_merchants text[] DEFAULT '{}',
  ad_numbers text[] NOT NULL DEFAULT '{}',
  offset_direction text NOT NULL DEFAULT 'UNDERCUT' CHECK (offset_direction IN ('OVERCUT', 'UNDERCUT')),
  offset_amount numeric DEFAULT 0,
  offset_pct numeric DEFAULT 0,
  max_ceiling numeric,
  min_floor numeric,
  max_ratio_ceiling numeric,
  min_ratio_floor numeric,
  max_deviation_from_market_pct numeric DEFAULT 5,
  max_price_change_per_cycle numeric,
  max_ratio_change_per_cycle numeric,
  auto_pause_after_deviations int DEFAULT 5,
  manual_override_cooldown_minutes int DEFAULT 0,
  only_counter_when_online boolean DEFAULT false,
  pause_if_no_merchant_found boolean DEFAULT false,
  active_hours_start time,
  active_hours_end time,
  resting_price numeric,
  resting_ratio numeric,
  check_interval_seconds int DEFAULT 120,
  last_checked_at timestamptz,
  last_competitor_price numeric,
  last_applied_price numeric,
  last_applied_ratio numeric,
  last_matched_merchant text,
  last_error text,
  consecutive_errors int DEFAULT 0,
  consecutive_deviations int DEFAULT 0,
  last_manual_edit_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.ad_pricing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.ad_pricing_rules(id) ON DELETE CASCADE,
  ad_number text,
  competitor_merchant text,
  competitor_price numeric,
  market_reference_price numeric,
  deviation_from_market_pct numeric,
  calculated_price numeric,
  calculated_ratio numeric,
  applied_price numeric,
  applied_ratio numeric,
  was_capped boolean DEFAULT false,
  was_rate_limited boolean DEFAULT false,
  skipped_reason text,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.ad_automation_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adv_no text NOT NULL UNIQUE,
  excluded_at timestamptz DEFAULT now(),
  reason text
);

-- Index for fast log queries
CREATE INDEX idx_ad_pricing_logs_rule_id ON public.ad_pricing_logs(rule_id);
CREATE INDEX idx_ad_pricing_logs_created_at ON public.ad_pricing_logs(created_at DESC);
CREATE INDEX idx_ad_pricing_logs_status ON public.ad_pricing_logs(status);

-- Updated_at trigger for rules
CREATE OR REPLACE FUNCTION update_ad_pricing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_ad_pricing_rules_updated_at
  BEFORE UPDATE ON public.ad_pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_pricing_rules_updated_at();

-- Disable RLS (Terminal uses custom auth, not Supabase auth)
ALTER TABLE public.ad_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_pricing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_automation_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for ad_pricing_rules" ON public.ad_pricing_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for ad_pricing_logs" ON public.ad_pricing_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for ad_automation_exclusions" ON public.ad_automation_exclusions FOR ALL USING (true) WITH CHECK (true);
