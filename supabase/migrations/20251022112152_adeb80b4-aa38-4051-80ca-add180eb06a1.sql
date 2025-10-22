-- Create subsidiaries table for company compliance
CREATE TABLE public.subsidiaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_name TEXT NOT NULL,
  firm_composition TEXT NOT NULL CHECK (firm_composition IN ('SOLE_PROPRIETORSHIP', 'LLP', 'TRUST', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED')),
  gst_number TEXT,
  pan_number TEXT,
  registration_number TEXT,
  registered_address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  date_of_incorporation DATE,
  documents JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISSOLVED')),
  compliance_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subsidiaries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on subsidiaries"
ON public.subsidiaries
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_subsidiaries_firm_composition ON public.subsidiaries(firm_composition);
CREATE INDEX idx_subsidiaries_status ON public.subsidiaries(status);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_subsidiaries_updated_at
BEFORE UPDATE ON public.subsidiaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();