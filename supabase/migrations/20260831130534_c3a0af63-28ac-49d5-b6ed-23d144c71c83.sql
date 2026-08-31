ALTER TABLE public.ad_pricing_rules
  ADD COLUMN IF NOT EXISTS ladder_conflict_resolution boolean NOT NULL DEFAULT false;