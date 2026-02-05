-- Add wallet_id column to purchase_orders table to properly store the wallet/platform
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id);

-- Update existing orders with wallet_id from purchase_order_items where available
UPDATE public.purchase_orders po
SET wallet_id = (
  SELECT poi.warehouse_id 
  FROM public.purchase_order_items poi 
  WHERE poi.purchase_order_id = po.id 
  LIMIT 1
)
WHERE po.wallet_id IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_purchase_orders_wallet_id ON public.purchase_orders(wallet_id);