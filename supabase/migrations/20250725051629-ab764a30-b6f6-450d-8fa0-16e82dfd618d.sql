-- Create account investigations table
CREATE TABLE public.account_investigations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  investigation_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  assigned_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT
);

-- Create investigation steps table
CREATE TABLE public.investigation_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investigation_id UUID NOT NULL REFERENCES account_investigations(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_title TEXT NOT NULL,
  step_description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create investigation updates table  
CREATE TABLE public.investigation_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investigation_id UUID NOT NULL REFERENCES account_investigations(id) ON DELETE CASCADE,
  update_text TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'UPDATE',
  created_by TEXT,
  attachment_urls TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.account_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_updates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on account_investigations" 
ON public.account_investigations 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on investigation_steps" 
ON public.investigation_steps 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on investigation_updates" 
ON public.investigation_updates 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create triggers for updated_at
CREATE TRIGGER update_account_investigations_updated_at
BEFORE UPDATE ON public.account_investigations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();