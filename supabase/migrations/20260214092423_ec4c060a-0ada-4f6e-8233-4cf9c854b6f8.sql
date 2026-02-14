
-- Add market_rate_usdt column to purchase_orders
-- Stores the CoinUSDT rate at time of order completion/approval
-- For USDT orders this will be 1.0, for non-USDT it captures live CoinUSDT rate
ALTER TABLE public.purchase_orders 
ADD COLUMN market_rate_usdt NUMERIC DEFAULT NULL;

-- Add market_rate_usdt column to sales_orders
ALTER TABLE public.sales_orders 
ADD COLUMN market_rate_usdt NUMERIC DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.purchase_orders.market_rate_usdt IS 'CoinUSDT market rate at time of purchase approval. 1.0 for USDT orders.';
COMMENT ON COLUMN public.sales_orders.market_rate_usdt IS 'CoinUSDT market rate at time of sale approval. 1.0 for USDT orders.';
