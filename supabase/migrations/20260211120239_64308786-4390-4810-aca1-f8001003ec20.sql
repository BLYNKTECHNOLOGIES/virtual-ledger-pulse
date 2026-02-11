
-- Drop the partial unique index that doesn't work with PostgREST upsert
DROP INDEX IF EXISTS idx_spot_trade_history_binance_trade;

-- Create a proper unique constraint (not partial) for upsert to work
-- First, set NULL binance_trade_id to a generated value so the constraint works
UPDATE public.spot_trade_history 
SET binance_trade_id = 'manual_' || id 
WHERE binance_trade_id IS NULL;

-- Make binance_trade_id NOT NULL with a default
ALTER TABLE public.spot_trade_history 
ALTER COLUMN binance_trade_id SET DEFAULT '';

ALTER TABLE public.spot_trade_history 
ALTER COLUMN binance_trade_id SET NOT NULL;

-- Now create the real unique constraint
ALTER TABLE public.spot_trade_history 
ADD CONSTRAINT uq_spot_trade_binance_id_symbol UNIQUE (binance_trade_id, symbol);
