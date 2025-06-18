
-- Create a table for pending user registrations
CREATE TABLE public.pending_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  rejection_reason TEXT,
  UNIQUE(username),
  UNIQUE(email)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON public.pending_registrations(email);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_username ON public.pending_registrations(username);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_status ON public.pending_registrations(status);

-- Enable RLS
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for admins to view all pending registrations
CREATE POLICY "Allow all operations on pending_registrations" ON public.pending_registrations FOR ALL USING (true);

-- Create function to approve registration
CREATE OR REPLACE FUNCTION public.approve_registration(registration_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reg_record RECORD;
BEGIN
  -- Get the pending registration
  SELECT * INTO reg_record FROM public.pending_registrations 
  WHERE id = registration_id AND status = 'PENDING';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into users table
  INSERT INTO public.users (
    username, email, first_name, last_name, phone, password_hash, status
  ) VALUES (
    reg_record.username, 
    reg_record.email, 
    reg_record.first_name, 
    reg_record.last_name, 
    reg_record.phone, 
    reg_record.password_hash, 
    'ACTIVE'
  );
  
  -- Update pending registration status
  UPDATE public.pending_registrations 
  SET status = 'APPROVED', reviewed_at = now()
  WHERE id = registration_id;
  
  RETURN TRUE;
END;
$$;

-- Create function to reject registration
CREATE OR REPLACE FUNCTION public.reject_registration(registration_id UUID, reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.pending_registrations 
  SET status = 'REJECTED', reviewed_at = now(), rejection_reason = reason
  WHERE id = registration_id AND status = 'PENDING';
  
  RETURN FOUND;
END;
$$;
