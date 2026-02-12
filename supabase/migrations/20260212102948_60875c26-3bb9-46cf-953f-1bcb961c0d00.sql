
-- Add spot_trade_id to erp_product_conversions for dedup tracking
ALTER TABLE public.erp_product_conversions
  ADD COLUMN spot_trade_id UUID REFERENCES spot_trade_history(id) UNIQUE;

-- Add default_conversion_wallet_id to system or use a simple config
-- We'll store it in a lightweight settings approach via metadata
