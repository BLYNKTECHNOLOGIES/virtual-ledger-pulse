-- Add attachments column to lien_updates table
ALTER TABLE public.lien_updates 
ADD COLUMN attachment_urls TEXT[] DEFAULT '{}';

-- Create compliance_documents table for document management
CREATE TABLE public.compliance_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on compliance_documents
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for compliance_documents
CREATE POLICY "Allow all operations on compliance_documents" 
ON public.compliance_documents 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create legal_actions table for legal action tracking
CREATE TABLE public.legal_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  case_number TEXT,
  court_name TEXT,
  opposing_party TEXT,
  our_lawyer TEXT,
  opposing_lawyer TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  date_filed DATE,
  next_hearing_date DATE,
  estimated_cost NUMERIC DEFAULT 0,
  actual_cost NUMERIC DEFAULT 0,
  case_documents TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on legal_actions
ALTER TABLE public.legal_actions ENABLE ROW LEVEL SECURITY;

-- Create policies for legal_actions
CREATE POLICY "Allow all operations on legal_actions" 
ON public.legal_actions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create legal_communications table for legal communications tracking
CREATE TABLE public.legal_communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  communication_type TEXT NOT NULL,
  party_name TEXT NOT NULL,
  contact_person TEXT,
  subject TEXT NOT NULL,
  content TEXT,
  communication_date DATE NOT NULL DEFAULT CURRENT_DATE,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  attachments TEXT[] DEFAULT '{}',
  legal_action_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on legal_communications  
ALTER TABLE public.legal_communications ENABLE ROW LEVEL SECURITY;

-- Create policies for legal_communications
CREATE POLICY "Allow all operations on legal_communications" 
ON public.legal_communications 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add foreign key relationship
ALTER TABLE public.legal_communications 
ADD CONSTRAINT fk_legal_communications_legal_action 
FOREIGN KEY (legal_action_id) REFERENCES public.legal_actions(id);

-- Create trigger for updating updated_at
CREATE TRIGGER update_compliance_documents_updated_at
BEFORE UPDATE ON public.compliance_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_legal_actions_updated_at
BEFORE UPDATE ON public.legal_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_legal_communications_updated_at
BEFORE UPDATE ON public.legal_communications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();