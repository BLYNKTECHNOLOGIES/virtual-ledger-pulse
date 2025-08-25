-- Add quantity and price_per_unit columns to purchase_orders table
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS price_per_unit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS product_name text,
ADD COLUMN IF NOT EXISTS product_category text;