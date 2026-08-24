ALTER TABLE public.ad_pricing_rules
  ADD COLUMN IF NOT EXISTS competitor_identities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS min_vip_level integer,
  ADD COLUMN IF NOT EXISTS enforce_zone_match boolean NOT NULL DEFAULT true;

ALTER TABLE public.ad_pricing_logs
  ADD COLUMN IF NOT EXISTS competitor_identity text,
  ADD COLUMN IF NOT EXISTS competitor_vip_level integer,
  ADD COLUMN IF NOT EXISTS ad_zone text;

ALTER TABLE public.ad_pricing_effectiveness_snapshots
  ADD COLUMN IF NOT EXISTS competitor_zone text,
  ADD COLUMN IF NOT EXISTS competitor_identity text;

ALTER TABLE public.ad_pricing_engine_state
  ADD COLUMN IF NOT EXISTS last_zone text,
  ADD COLUMN IF NOT EXISTS last_merchant_identity text;

COMMENT ON COLUMN public.ad_pricing_rules.competitor_identities IS 'Optional merchant-level filter (MASS_MERCHANT / BLOCK_MERCHANT) for top_badged targeting';
COMMENT ON COLUMN public.ad_pricing_rules.min_vip_level IS 'Optional minimum advertiser vipLevel for top_badged targeting';
COMMENT ON COLUMN public.ad_pricing_rules.enforce_zone_match IS 'Skip ads whose Binance classify zone does not match competitor_zone';
COMMENT ON COLUMN public.ad_pricing_logs.ad_zone IS 'Zone of our own ad (from Binance classify) at the time of the cycle';