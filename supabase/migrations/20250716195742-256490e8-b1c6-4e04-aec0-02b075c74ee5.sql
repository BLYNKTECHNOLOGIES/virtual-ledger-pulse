-- Add beneficiaries_per_24h field to purchase_payment_methods table
ALTER TABLE public.purchase_payment_methods 
ADD COLUMN beneficiaries_per_24h INTEGER DEFAULT 5;

-- Add beneficiaries_per_24h field to sales_payment_methods table  
ALTER TABLE public.sales_payment_methods 
ADD COLUMN beneficiaries_per_24h INTEGER DEFAULT 5;

-- Add comment to explain the field
COMMENT ON COLUMN public.purchase_payment_methods.beneficiaries_per_24h IS 'Number of beneficiaries allowed per 24 hours for bank transfer payments';
COMMENT ON COLUMN public.sales_payment_methods.beneficiaries_per_24h IS 'Number of beneficiaries allowed per 24 hours for bank transfer payments';