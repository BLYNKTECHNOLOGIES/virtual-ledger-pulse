
-- Add contact_number and warehouse_name fields to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN contact_number TEXT,
ADD COLUMN warehouse_name TEXT;
