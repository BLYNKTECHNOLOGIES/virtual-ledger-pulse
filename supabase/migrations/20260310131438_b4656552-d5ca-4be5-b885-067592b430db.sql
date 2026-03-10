
-- Fix 1: Add missing DELETE and UPDATE policies for purchase_order_payment_splits
CREATE POLICY "Allow delete on payment splits" 
ON public.purchase_order_payment_splits
FOR DELETE
TO anon, authenticated
USING (true);

CREATE POLICY "Allow update on payment splits"
ON public.purchase_order_payment_splits
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
