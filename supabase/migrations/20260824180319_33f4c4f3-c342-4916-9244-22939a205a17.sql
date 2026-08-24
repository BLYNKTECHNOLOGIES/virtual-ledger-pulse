ALTER TABLE public.ad_pricing_rules
  ADD COLUMN IF NOT EXISTS competitor_zone text NOT NULL DEFAULT 'p2p',
  ADD COLUMN IF NOT EXISTS competitor_mode text NOT NULL DEFAULT 'nickname',
  ADD COLUMN IF NOT EXISTS competitor_badges text[] NOT NULL DEFAULT ARRAY['Block','Shield']::text[],
  ADD COLUMN IF NOT EXISTS exclude_merchants text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_pricing_rules_competitor_zone_chk') THEN
    ALTER TABLE public.ad_pricing_rules ADD CONSTRAINT ad_pricing_rules_competitor_zone_chk CHECK (competitor_zone IN ('p2p','block'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_pricing_rules_competitor_mode_chk') THEN
    ALTER TABLE public.ad_pricing_rules ADD CONSTRAINT ad_pricing_rules_competitor_mode_chk CHECK (competitor_mode IN ('nickname','top_badged'));
  END IF;
END $$;

ALTER TABLE public.ad_pricing_logs
  ADD COLUMN IF NOT EXISTS competitor_zone text,
  ADD COLUMN IF NOT EXISTS competitor_badges text[];