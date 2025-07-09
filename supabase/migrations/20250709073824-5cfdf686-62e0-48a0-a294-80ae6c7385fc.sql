-- Add payment status tracking columns to kyc_approval_requests table
ALTER TABLE public.kyc_approval_requests 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.sales_payment_methods(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_kyc_approval_requests_payment_status ON public.kyc_approval_requests(payment_status);
CREATE INDEX IF NOT EXISTS idx_kyc_approval_requests_payment_method ON public.kyc_approval_requests(payment_method_id);