-- Add settlement cycle fields to sales_payment_methods table
ALTER TABLE public.sales_payment_methods 
ADD COLUMN payment_gateway BOOLEAN DEFAULT false,
ADD COLUMN settlement_cycle TEXT CHECK (settlement_cycle IN ('Instant Settlement', 'T+1 Day', 'Custom')) DEFAULT NULL,
ADD COLUMN settlement_days INTEGER DEFAULT NULL;