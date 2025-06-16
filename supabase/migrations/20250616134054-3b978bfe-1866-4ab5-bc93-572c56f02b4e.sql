
-- Create payment_methods table for sales workflow
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('UPI', 'Bank Account')),
  upi_id TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  bank_name TEXT,
  risk_category TEXT NOT NULL CHECK (risk_category IN ('High Risk', 'Medium Risk', 'Low Risk', 'No Risk')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  daily_limit NUMERIC DEFAULT 0,
  monthly_limit NUMERIC DEFAULT 0,
  current_daily_used NUMERIC DEFAULT 0,
  current_monthly_used NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create platforms table for sales workflow
CREATE TABLE IF NOT EXISTS public.platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add missing columns to sales_orders table
ALTER TABLE public.sales_orders 
ADD COLUMN IF NOT EXISTS platform TEXT,
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_method_id UUID,
ADD COLUMN IF NOT EXISTS cosmos_alert BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS credits_applied NUMERIC DEFAULT 0;

-- Create warehouses table
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add warehouse_id to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  total_amount NUMERIC NOT NULL,
  order_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase_order_items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id)
);

-- Create interview_schedules table
CREATE TABLE IF NOT EXISTS public.interview_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.job_applicants(id),
  interview_date TIMESTAMP WITH TIME ZONE NOT NULL,
  interview_type TEXT,
  interviewer_name TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'NOT_APPEARED', 'CANCELLED')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create offer_documents table
CREATE TABLE IF NOT EXISTS public.offer_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.job_applicants(id),
  document_type TEXT NOT NULL,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED')),
  sent_date DATE,
  response_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add address and other missing fields to job_applicants
ALTER TABLE public.job_applicants 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'APPLIED',
ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Insert some default data
INSERT INTO public.platforms (name) VALUES 
('BITGET SS'), ('BINANCE SS'), ('KUCOIN'), ('BYBIT'), ('COINBASE')
ON CONFLICT DO NOTHING;

INSERT INTO public.warehouses (name, location) VALUES 
('Main Warehouse', 'Mumbai'), ('Secondary Warehouse', 'Delhi')
ON CONFLICT DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allowing all operations for now - can be refined later)
CREATE POLICY "Allow all operations on payment_methods" ON public.payment_methods FOR ALL USING (true);
CREATE POLICY "Allow all operations on platforms" ON public.platforms FOR ALL USING (true);
CREATE POLICY "Allow all operations on warehouses" ON public.warehouses FOR ALL USING (true);
CREATE POLICY "Allow all operations on purchase_orders" ON public.purchase_orders FOR ALL USING (true);
CREATE POLICY "Allow all operations on purchase_order_items" ON public.purchase_order_items FOR ALL USING (true);
CREATE POLICY "Allow all operations on interview_schedules" ON public.interview_schedules FOR ALL USING (true);
CREATE POLICY "Allow all operations on offer_documents" ON public.offer_documents FOR ALL USING (true);
