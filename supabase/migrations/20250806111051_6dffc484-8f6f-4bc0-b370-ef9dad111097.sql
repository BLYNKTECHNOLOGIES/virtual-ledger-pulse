-- Create risk_flags table for tracking user risk assessments
CREATE TABLE public.risk_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  flag_reason TEXT NOT NULL,
  risk_score INTEGER DEFAULT 0,
  flagged_on TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'FLAGGED' CHECK (status IN ('FLAGGED', 'UNDER_REKYC', 'CLEARED', 'BLACKLISTED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_on TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.users(id),
  admin_notes TEXT
);

-- Create rekyc_requests table for managing ReKYC workflow
CREATE TABLE public.rekyc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_flag_id UUID REFERENCES public.risk_flags(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  aadhar_front_url TEXT,
  aadhar_back_url TEXT,
  pan_card_url TEXT,
  bank_statement_url TEXT,
  vkyc_video_url TEXT,
  vkyc_completed BOOLEAN DEFAULT false,
  vkyc_completed_at TIMESTAMP WITH TIME ZONE,
  user_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_decision TEXT CHECK (review_decision IN ('APPROVED', 'REJECTED', 'NEEDS_MORE_INFO')),
  review_notes TEXT
);

-- Create risk_detection_logs table for audit trail
CREATE TABLE public.risk_detection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  detection_type TEXT NOT NULL,
  risk_score INTEGER DEFAULT 0,
  details JSONB,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  flagged BOOLEAN DEFAULT false
);

-- Enable RLS on all tables
ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekyc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_detection_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on risk_flags" ON public.risk_flags FOR ALL USING (true);
CREATE POLICY "Allow all operations on rekyc_requests" ON public.rekyc_requests FOR ALL USING (true);
CREATE POLICY "Allow all operations on risk_detection_logs" ON public.risk_detection_logs FOR ALL USING (true);

-- Create indexes for better performance
CREATE INDEX idx_risk_flags_user_id ON public.risk_flags(user_id);
CREATE INDEX idx_risk_flags_status ON public.risk_flags(status);
CREATE INDEX idx_risk_flags_flagged_on ON public.risk_flags(flagged_on);
CREATE INDEX idx_rekyc_requests_user_id ON public.rekyc_requests(user_id);
CREATE INDEX idx_rekyc_requests_status ON public.rekyc_requests(status);
CREATE INDEX idx_risk_detection_logs_user_id ON public.risk_detection_logs(user_id);
CREATE INDEX idx_risk_detection_logs_detected_at ON public.risk_detection_logs(detected_at);

-- Create function to calculate total risk score for a user
CREATE OR REPLACE FUNCTION public.calculate_user_risk_score(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_score INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(risk_score), 0) INTO total_score
  FROM public.risk_flags
  WHERE user_id = user_uuid AND status = 'FLAGGED';
  
  RETURN total_score;
END;
$$;

-- Create function to update risk flag status
CREATE OR REPLACE FUNCTION public.update_risk_flag_status(
  flag_id UUID,
  new_status TEXT,
  admin_id UUID DEFAULT NULL,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.risk_flags
  SET 
    status = new_status,
    resolved_on = CASE WHEN new_status IN ('CLEARED', 'BLACKLISTED') THEN now() ELSE NULL END,
    resolved_by = admin_id,
    admin_notes = COALESCE(notes, admin_notes),
    updated_at = now()
  WHERE id = flag_id;
  
  RETURN FOUND;
END;
$$;

-- Create trigger to update updated_at on risk_flags
CREATE OR REPLACE FUNCTION public.update_risk_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_risk_flags_updated_at
BEFORE UPDATE ON public.risk_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_risk_flags_updated_at();

-- Create trigger to update updated_at on rekyc_requests
CREATE OR REPLACE FUNCTION public.update_rekyc_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rekyc_requests_updated_at
BEFORE UPDATE ON public.rekyc_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_rekyc_requests_updated_at();