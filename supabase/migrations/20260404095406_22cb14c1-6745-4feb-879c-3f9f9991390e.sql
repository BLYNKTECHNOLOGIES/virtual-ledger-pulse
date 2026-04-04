-- Drop the old unique constraint that only allows one pending settlement per order
-- Split payments can have multiple gateway/POS methods per order
ALTER TABLE public.pending_settlements DROP CONSTRAINT IF EXISTS unique_sales_order_pending_settlement;

-- Add a new unique constraint that allows multiple settlements per order but prevents duplicates per method
ALTER TABLE public.pending_settlements ADD CONSTRAINT unique_sales_order_payment_method_settlement UNIQUE (sales_order_id, payment_method_id);