
-- Create comprehensive sales_orders table to replace the existing one with proper structure
DROP TABLE IF EXISTS public.sales_orders CASCADE;

CREATE TABLE public.sales_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  platform TEXT,
  product_id UUID REFERENCES public.products(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price_per_unit NUMERIC NOT NULL CHECK (price_per_unit >= 0),
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  sales_payment_method_id UUID REFERENCES public.sales_payment_methods(id),
  payment_status TEXT NOT NULL DEFAULT 'COMPLETED',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  order_date DATE NOT NULL,
  description TEXT,
  cosmos_alert BOOLEAN DEFAULT false,
  risk_level TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_number ON public.sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_client_name ON public.sales_orders(client_name);
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON public.sales_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_sales_orders_product_id ON public.sales_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_warehouse_id ON public.sales_orders(warehouse_id);

-- Enable RLS
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policy (assuming no authentication required based on existing tables)
CREATE POLICY "Allow all operations on sales_orders" ON public.sales_orders FOR ALL USING (true);
