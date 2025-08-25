-- First, let's check and update the status values for account_investigations
-- Update status to include PENDING_APPROVAL if not exists
UPDATE public.account_investigations SET status = status WHERE status IN ('ACTIVE', 'RESOLVED', 'PENDING_APPROVAL');

-- Create investigation approvals table for tracking approval workflow
CREATE TABLE IF NOT EXISTS public.investigation_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investigation_id UUID NOT NULL REFERENCES public.account_investigations(id) ON DELETE CASCADE,
  submitted_by TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  final_resolution TEXT NOT NULL,
  supporting_documents_urls TEXT[],
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on investigation_approvals table
ALTER TABLE public.investigation_approvals ENABLE ROW LEVEL SECURITY;

-- Create policies for investigation_approvals
CREATE POLICY "Allow all operations on investigation_approvals" 
ON public.investigation_approvals FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updating updated_at column
CREATE OR REPLACE FUNCTION public.update_investigation_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_investigation_approvals_updated_at
  BEFORE UPDATE ON public.investigation_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_investigation_approvals_updated_at();