
-- Add reorder_level column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 0;
