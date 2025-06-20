
-- Create video KYC sessions table
CREATE TABLE public.video_kyc_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kyc_request_id UUID NOT NULL REFERENCES public.kyc_approval_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  session_notes TEXT,
  verification_result TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for video_kyc_sessions
ALTER TABLE public.video_kyc_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all video KYC sessions" 
  ON public.video_kyc_sessions 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can create video KYC sessions" 
  ON public.video_kyc_sessions 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update video KYC sessions" 
  ON public.video_kyc_sessions 
  FOR UPDATE 
  USING (true);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_video_kyc_sessions_updated_at 
  BEFORE UPDATE ON public.video_kyc_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
