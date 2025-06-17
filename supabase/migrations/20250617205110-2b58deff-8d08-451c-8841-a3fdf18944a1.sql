
-- Update warehouse_stock_movements table to support decimal quantities
ALTER TABLE public.warehouse_stock_movements 
ALTER COLUMN quantity TYPE numeric;

-- Update stock_adjustments table to support decimal quantities  
ALTER TABLE public.stock_adjustments 
ALTER COLUMN quantity TYPE numeric;

-- Update stock_transactions table to support decimal quantities
ALTER TABLE public.stock_transactions 
ALTER COLUMN quantity TYPE numeric;

-- Update sales_order_items table to support decimal quantities
ALTER TABLE public.sales_order_items 
ALTER COLUMN quantity TYPE numeric;

-- Update purchase_order_items table to support decimal quantities
ALTER TABLE public.purchase_order_items 
ALTER COLUMN quantity TYPE numeric;

-- Update products table to support decimal stock quantities
ALTER TABLE public.products 
ALTER COLUMN current_stock_quantity TYPE numeric,
ALTER COLUMN total_purchases TYPE numeric,
ALTER COLUMN total_sales TYPE numeric;
