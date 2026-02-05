-- Fix foreign key constraint: purchase_order_payment_splits.created_by should reference public.users, not auth.users
-- This app uses a custom authentication system with users in public.users

-- Drop the incorrect foreign key constraint
ALTER TABLE public.purchase_order_payment_splits 
DROP CONSTRAINT IF EXISTS purchase_order_payment_splits_created_by_fkey;

-- Add the correct foreign key constraint referencing public.users
ALTER TABLE public.purchase_order_payment_splits 
ADD CONSTRAINT purchase_order_payment_splits_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id);