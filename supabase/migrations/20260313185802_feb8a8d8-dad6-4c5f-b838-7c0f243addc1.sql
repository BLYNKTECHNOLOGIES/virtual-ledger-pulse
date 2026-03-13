
ALTER TABLE public.binance_order_history
ADD COLUMN IF NOT EXISTS seller_payment_details JSONB DEFAULT NULL;

COMMENT ON COLUMN public.binance_order_history.seller_payment_details IS 'Captured from getUserOrderDetail while order is live (TRADING/BUYER_PAYED). Contains seller bank/UPI payment method details.';
