-- Fix: Remove old anon/public policies from purchase_order_payment_splits
DROP POLICY IF EXISTS "Allow delete on payment splits" ON public.purchase_order_payment_splits;
DROP POLICY IF EXISTS "Allow update on payment splits" ON public.purchase_order_payment_splits;
DROP POLICY IF EXISTS "Allow insert on payment splits" ON public.purchase_order_payment_splits;
DROP POLICY IF EXISTS "Allow read access on payment splits" ON public.purchase_order_payment_splits;