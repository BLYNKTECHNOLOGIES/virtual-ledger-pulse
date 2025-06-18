
-- Add safe_funds column to purchase_payment_methods table
ALTER TABLE public.purchase_payment_methods 
ADD COLUMN safe_funds BOOLEAN NOT NULL DEFAULT false;

-- Add index for better performance when filtering by safe_funds
CREATE INDEX idx_purchase_payment_methods_safe_funds ON public.purchase_payment_methods(safe_funds);
