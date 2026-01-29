-- Add fee columns to wallets table
ALTER TABLE public.wallets 
ADD COLUMN IF NOT EXISTS fee_percentage DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_fee_enabled BOOLEAN DEFAULT true;

-- Add fee columns to sales_orders table
ALTER TABLE public.sales_orders
ADD COLUMN IF NOT EXISTS is_off_market BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS fee_percentage DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_amount DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount DECIMAL DEFAULT 0;

-- Add fee columns to purchase_orders table
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS is_off_market BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS fee_percentage DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_amount DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount DECIMAL DEFAULT 0;

-- Create wallet_fee_deductions table to track all fee deductions
CREATE TABLE IF NOT EXISTS public.wallet_fee_deductions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID REFERENCES public.wallets(id),
  order_id UUID NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('SALES', 'PURCHASE')),
  order_number TEXT NOT NULL,
  gross_amount DECIMAL NOT NULL,
  fee_percentage DECIMAL NOT NULL DEFAULT 0,
  fee_amount DECIMAL NOT NULL DEFAULT 0,
  net_amount DECIMAL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on wallet_fee_deductions
ALTER TABLE public.wallet_fee_deductions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for wallet_fee_deductions
CREATE POLICY "Allow all operations on wallet_fee_deductions" 
ON public.wallet_fee_deductions 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_wallet_fee_deductions_wallet_id ON public.wallet_fee_deductions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_fee_deductions_order_type ON public.wallet_fee_deductions(order_type);
CREATE INDEX IF NOT EXISTS idx_wallet_fee_deductions_created_at ON public.wallet_fee_deductions(created_at DESC);