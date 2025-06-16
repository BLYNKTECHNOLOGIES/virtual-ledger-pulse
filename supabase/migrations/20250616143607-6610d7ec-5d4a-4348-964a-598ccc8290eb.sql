
-- Create sales_payment_methods table
CREATE TABLE IF NOT EXISTS public.sales_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('UPI', 'Bank Account')),
  upi_id TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  risk_category TEXT NOT NULL CHECK (risk_category IN ('High Risk', 'Medium Risk', 'Low Risk', 'No Risk')),
  payment_limit NUMERIC NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL CHECK (frequency IN ('24 hours', 'Daily', '48 hours', 'Custom')),
  custom_frequency TEXT,
  current_usage NUMERIC DEFAULT 0,
  last_reset TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase_payment_methods table
CREATE TABLE IF NOT EXISTS public.purchase_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  payment_limit NUMERIC NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL CHECK (frequency IN ('24 hours', 'Daily', '48 hours', 'Custom')),
  custom_frequency TEXT,
  current_usage NUMERIC DEFAULT 0,
  last_reset TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stock_adjustments table for warehouse transfers
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  from_warehouse_id UUID REFERENCES public.warehouses(id),
  to_warehouse_id UUID REFERENCES public.warehouses(id),
  quantity INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('TRANSFER', 'ADJUSTMENT', 'DAMAGE', 'LOSS')),
  reason TEXT,
  reference_number TEXT,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update sales_orders to link with sales_payment_methods
ALTER TABLE public.sales_orders 
DROP COLUMN IF EXISTS payment_method_id,
ADD COLUMN sales_payment_method_id UUID REFERENCES public.sales_payment_methods(id);

-- Update purchase_orders to link with purchase_payment_methods
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS purchase_payment_method_id UUID REFERENCES public.purchase_payment_methods(id);

-- Add warehouse stock tracking columns to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS warehouse_stock JSONB DEFAULT '{}';

-- Enable RLS on new tables
ALTER TABLE public.sales_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on sales_payment_methods" ON public.sales_payment_methods FOR ALL USING (true);
CREATE POLICY "Allow all operations on purchase_payment_methods" ON public.purchase_payment_methods FOR ALL USING (true);
CREATE POLICY "Allow all operations on stock_adjustments" ON public.stock_adjustments FOR ALL USING (true);

-- Insert some sample sales payment methods
INSERT INTO public.sales_payment_methods (type, upi_id, risk_category, payment_limit, frequency) 
VALUES 
('UPI', 'business@paytm', 'Low Risk', 100000, 'Daily'),
('UPI', 'company@gpay', 'Medium Risk', 50000, '24 hours')
ON CONFLICT DO NOTHING;
