-- Add multi-asset support to ad_pricing_rules
ALTER TABLE public.ad_pricing_rules 
  ADD COLUMN IF NOT EXISTS assets text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS asset_config jsonb DEFAULT '{}'::jsonb;

-- Migrate existing single-asset data to the new arrays
UPDATE public.ad_pricing_rules 
SET assets = ARRAY[asset],
    asset_config = jsonb_build_object(
      asset, jsonb_build_object(
        'ad_numbers', to_jsonb(ad_numbers),
        'offset_amount', COALESCE(offset_amount, 0),
        'offset_pct', COALESCE(offset_pct, 0),
        'max_ceiling', max_ceiling,
        'min_floor', min_floor,
        'max_ratio_ceiling', max_ratio_ceiling,
        'min_ratio_floor', min_ratio_floor
      )
    )
WHERE assets = ARRAY[]::text[] OR assets IS NULL;

-- Add asset column to ad_pricing_logs
ALTER TABLE public.ad_pricing_logs 
  ADD COLUMN IF NOT EXISTS asset text;