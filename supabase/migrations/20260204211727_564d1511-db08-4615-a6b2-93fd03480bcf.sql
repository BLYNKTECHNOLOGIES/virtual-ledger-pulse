-- Add nickname column to sales_payment_methods table
ALTER TABLE public.sales_payment_methods 
ADD COLUMN IF NOT EXISTS nickname TEXT;