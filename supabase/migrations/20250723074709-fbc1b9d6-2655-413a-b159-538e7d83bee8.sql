-- Create client_onboarding_approvals table for compliance review of new clients
CREATE TABLE public.client_onboarding_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Order and client details
  sales_order_id UUID REFERENCES public.sales_orders(id),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  order_amount NUMERIC NOT NULL,
  order_date DATE NOT NULL,
  
  -- KYC Documents from the order
  aadhar_front_url TEXT,
  aadhar_back_url TEXT,
  additional_documents_url TEXT[],
  binance_id_screenshot_url TEXT,
  
  -- Video KYC details
  vkyc_recording_url TEXT,
  vkyc_notes TEXT,
  
  -- Compliance review
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Client onboarding details (filled by compliance officer)
  aadhar_number TEXT,
  address TEXT,
  purpose_of_buying TEXT,
  proposed_monthly_limit NUMERIC,
  risk_assessment TEXT,
  compliance_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_onboarding_approvals ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on client_onboarding_approvals" 
ON public.client_onboarding_approvals 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_client_onboarding_approvals_status ON public.client_onboarding_approvals(approval_status);
CREATE INDEX idx_client_onboarding_approvals_order ON public.client_onboarding_approvals(sales_order_id);
CREATE INDEX idx_client_onboarding_approvals_created ON public.client_onboarding_approvals(created_at);

-- Create trigger for updating updated_at
CREATE TRIGGER update_client_onboarding_approvals_updated_at
BEFORE UPDATE ON public.client_onboarding_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically create client onboarding approval when order is completed by new client
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is a new client (first order)
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    -- Check if client already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.clients 
      WHERE name = NEW.customer_name OR email = NEW.customer_email
    ) THEN
      -- Create onboarding approval entry
      INSERT INTO public.client_onboarding_approvals (
        sales_order_id,
        client_name,
        client_email,
        client_phone,
        order_amount,
        order_date,
        aadhar_front_url,
        aadhar_back_url,
        additional_documents_url,
        binance_id_screenshot_url
      ) VALUES (
        NEW.id,
        NEW.customer_name,
        NEW.customer_email,
        NEW.customer_phone,
        NEW.total_amount,
        NEW.order_date,
        NEW.aadhar_front_url,
        NEW.aadhar_back_url,
        NEW.additional_documents_url,
        NEW.binance_id_screenshot_url
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on sales_orders to auto-create onboarding approvals
CREATE TRIGGER trigger_create_client_onboarding_approval
AFTER UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.create_client_onboarding_approval();