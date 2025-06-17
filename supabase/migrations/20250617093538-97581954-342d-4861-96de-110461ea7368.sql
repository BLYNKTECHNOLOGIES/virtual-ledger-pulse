
-- Create sales_order_items table to track individual items in sales orders
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sales_order_id ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id ON public.sales_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_warehouse_id ON public.sales_order_items(warehouse_id);

-- Enable RLS
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (assuming no authentication required based on existing tables)
CREATE POLICY "Allow all operations on sales_order_items" ON public.sales_order_items FOR ALL USING (true);
