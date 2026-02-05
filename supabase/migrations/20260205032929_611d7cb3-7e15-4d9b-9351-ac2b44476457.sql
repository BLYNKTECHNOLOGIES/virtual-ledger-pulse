-- Add client_state column to sales_orders table
ALTER TABLE public.sales_orders 
ADD COLUMN client_state text;

-- Add client_state column to purchase_orders table if not exists
ALTER TABLE public.purchase_orders 
ADD COLUMN client_state text;