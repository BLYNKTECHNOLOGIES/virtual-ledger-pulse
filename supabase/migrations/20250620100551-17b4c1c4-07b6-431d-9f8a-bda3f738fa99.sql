
-- Create enum for KYC approval status
CREATE TYPE kyc_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'QUERY');

-- Create enum for query types
CREATE TYPE query_type AS ENUM ('VKYC_REQUIRED', 'MANUAL_QUERY');

-- Create KYC approval requests table
CREATE TABLE public.kyc_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_name TEXT NOT NULL,
  order_amount NUMERIC NOT NULL,
  purpose_of_buying TEXT,
  aadhar_front_image_url TEXT,
  aadhar_back_image_url TEXT,
  verified_feedback_screenshot_url TEXT,
  negative_feedback_screenshot_url TEXT,
  additional_info TEXT,
  status kyc_approval_status NOT NULL DEFAULT 'PENDING',
  requested_by UUID REFERENCES public.users(id),
  reviewed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  review_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);

-- Create KYC queries table
CREATE TABLE public.kyc_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID REFERENCES public.kyc_approval_requests(id) ON DELETE CASCADE,
  query_type query_type NOT NULL,
  vkyc_required BOOLEAN DEFAULT FALSE,
  manual_query_text TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  response_text TEXT
);

-- Create Video KYC table
CREATE TABLE public.video_kyc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID REFERENCES public.kyc_approval_requests(id),
  counterparty_name TEXT NOT NULL,
  scheduled_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', -- NEW, SCHEDULED, COMPLETED, CANCELLED
  notes TEXT,
  conducted_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.kyc_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_kyc ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allowing authenticated users to view/manage)
CREATE POLICY "Users can view KYC requests" ON public.kyc_approval_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create KYC requests" ON public.kyc_approval_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update KYC requests" ON public.kyc_approval_requests
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can view KYC queries" ON public.kyc_queries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create KYC queries" ON public.kyc_queries
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update KYC queries" ON public.kyc_queries
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can view Video KYC" ON public.video_kyc
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create Video KYC" ON public.video_kyc
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update Video KYC" ON public.video_kyc
  FOR UPDATE TO authenticated USING (true);

-- Create indexes for better performance
CREATE INDEX idx_kyc_requests_status ON public.kyc_approval_requests(status);
CREATE INDEX idx_kyc_requests_requested_by ON public.kyc_approval_requests(requested_by);
CREATE INDEX idx_video_kyc_status ON public.video_kyc(status);
