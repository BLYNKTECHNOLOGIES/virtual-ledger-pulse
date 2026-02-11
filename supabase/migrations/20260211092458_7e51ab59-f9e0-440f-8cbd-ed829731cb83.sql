
-- Add verified_name column to binance_order_history for storing counterparty real names
ALTER TABLE public.binance_order_history 
ADD COLUMN IF NOT EXISTS verified_name TEXT;

-- Add index for completed orders export queries
CREATE INDEX IF NOT EXISTS idx_binance_orders_completed 
ON public.binance_order_history(create_time DESC) 
WHERE order_status IN ('COMPLETED', '4', 'completed');
