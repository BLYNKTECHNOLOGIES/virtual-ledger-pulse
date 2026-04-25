ALTER TABLE public.ad_pricing_engine_state
ADD COLUMN IF NOT EXISTS merchant_business_status integer,
ADD COLUMN IF NOT EXISTS merchant_business_status_label text,
ADD COLUMN IF NOT EXISTS merchant_state_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS merchant_state_diagnostic text;