
-- Add source tracking and enriched fields to spot_trade_history
ALTER TABLE public.spot_trade_history 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'terminal',
ADD COLUMN IF NOT EXISTS binance_trade_id text,
ADD COLUMN IF NOT EXISTS trade_time bigint,
ADD COLUMN IF NOT EXISTS commission numeric,
ADD COLUMN IF NOT EXISTS commission_asset text,
ADD COLUMN IF NOT EXISTS is_buyer boolean,
ADD COLUMN IF NOT EXISTS is_maker boolean;

-- Unique constraint on binance_trade_id + symbol to prevent duplicate syncs
CREATE UNIQUE INDEX IF NOT EXISTS idx_spot_trade_history_binance_trade 
ON public.spot_trade_history (binance_trade_id, symbol) 
WHERE binance_trade_id IS NOT NULL;

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_spot_trade_history_source 
ON public.spot_trade_history (source);
