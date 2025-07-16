-- Create settlements table to track payment gateway settlements
CREATE TABLE IF NOT EXISTS public.payment_gateway_settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_batch_id TEXT NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  mdr_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  mdr_rate NUMERIC NOT NULL DEFAULT 0,
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settlement items table to track individual sales in settlements
CREATE TABLE IF NOT EXISTS public.payment_gateway_settlement_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id UUID NOT NULL REFERENCES public.payment_gateway_settlements(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add settlement tracking columns to sales_orders
ALTER TABLE public.sales_orders 
ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS settlement_batch_id TEXT,
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE;

-- Update existing payment gateway sales to have proper settlement status
UPDATE public.sales_orders 
SET settlement_status = 'PENDING' 
WHERE sales_payment_method_id IN (
  SELECT id FROM public.sales_payment_methods WHERE payment_gateway = true
) AND settlement_status IS NULL;

-- Enable RLS on new tables
ALTER TABLE public.payment_gateway_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_settlement_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on payment_gateway_settlements" 
ON public.payment_gateway_settlements FOR ALL USING (true);

CREATE POLICY "Allow all operations on payment_gateway_settlement_items" 
ON public.payment_gateway_settlement_items FOR ALL USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_orders_settlement_status ON public.sales_orders(settlement_status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_settlement_batch ON public.sales_orders(settlement_batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement_id ON public.payment_gateway_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_sales_order ON public.payment_gateway_settlement_items(sales_order_id);