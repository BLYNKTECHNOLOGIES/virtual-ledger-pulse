-- Add payment_method_id to sales_order_payment_splits to track the actual payment method used (not just bank account)
-- This is critical for distinguishing between POS/Gateway and Bank methods that share the same bank_account_id

ALTER TABLE public.sales_order_payment_splits 
ADD COLUMN payment_method_id UUID REFERENCES public.sales_payment_methods(id) ON DELETE SET NULL;

-- Add is_gateway flag to track if this split was through a payment gateway (POS)
ALTER TABLE public.sales_order_payment_splits
ADD COLUMN is_gateway BOOLEAN DEFAULT false;

-- Backfill existing splits where possible: try to match based on bank_account_id + non-gateway
-- (existing splits were all created as INCOME/direct, so they're non-gateway)
UPDATE public.sales_order_payment_splits sops
SET payment_method_id = (
  SELECT spm.id FROM sales_payment_methods spm 
  WHERE spm.bank_account_id = sops.bank_account_id 
  AND spm.payment_gateway = false 
  AND spm.is_active = true
  LIMIT 1
),
is_gateway = false
WHERE sops.payment_method_id IS NULL;