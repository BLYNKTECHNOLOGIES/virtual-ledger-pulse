-- Add upi_id column to purchase_payment_methods table
ALTER TABLE public.purchase_payment_methods 
ADD COLUMN IF NOT EXISTS upi_id TEXT;