
-- Create KYC approval requests table
CREATE TABLE public.kyc_approval_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  counterparty_name TEXT NOT NULL,
  order_amount NUMERIC NOT NULL,
  purpose_of_buying TEXT,
  additional_info TEXT,
  aadhar_front_url TEXT,
  aadhar_back_url TEXT,
  verified_feedback_url TEXT,
  negative_feedback_url TEXT,
  binance_id_screenshot_url TEXT NOT NULL, -- Mandatory
  additional_documents_url TEXT, -- Optional
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'QUERIED')),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create KYC queries table
CREATE TABLE public.kyc_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kyc_request_id UUID NOT NULL REFERENCES public.kyc_approval_requests(id) ON DELETE CASCADE,
  vkyc_required BOOLEAN NOT NULL DEFAULT false,
  manual_query TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  response_text TEXT
);

-- Add RLS policies for kyc_approval_requests
ALTER TABLE public.kyc_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all KYC requests" 
  ON public.kyc_approval_requests 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can create KYC requests" 
  ON public.kyc_approval_requests 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update KYC requests" 
  ON public.kyc_approval_requests 
  FOR UPDATE 
  USING (true);

-- Add RLS policies for kyc_queries
ALTER TABLE public.kyc_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all KYC queries" 
  ON public.kyc_queries 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can create KYC queries" 
  ON public.kyc_queries 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update KYC queries" 
  ON public.kyc_queries 
  FOR UPDATE 
  USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_kyc_approval_requests_updated_at 
  BEFORE UPDATE ON public.kyc_approval_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
