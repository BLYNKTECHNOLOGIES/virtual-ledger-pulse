-- Create bank_cases table for case management
CREATE TABLE public.bank_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  case_type TEXT NOT NULL CHECK (case_type IN (
    'ACCOUNT_NOT_WORKING',
    'WRONG_PAYMENT_INITIATED', 
    'PAYMENT_NOT_CREDITED',
    'SETTLEMENT_NOT_RECEIVED',
    'LIEN_RECEIVED',
    'BALANCE_DISCREPANCY'
  )),
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  amount_involved NUMERIC DEFAULT 0,
  transaction_reference TEXT,
  beneficiary_details TEXT,
  assigned_to TEXT,
  created_by TEXT,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  due_date DATE,
  documents_attached TEXT[] DEFAULT '{}',
  contact_person TEXT,
  contact_details TEXT
);

-- Enable RLS
ALTER TABLE public.bank_cases ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on bank_cases" 
ON public.bank_cases 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_bank_cases_updated_at
BEFORE UPDATE ON public.bank_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_bank_cases_status ON public.bank_cases(status);
CREATE INDEX idx_bank_cases_case_type ON public.bank_cases(case_type);
CREATE INDEX idx_bank_cases_bank_account ON public.bank_cases(bank_account_id);
CREATE INDEX idx_bank_cases_created_at ON public.bank_cases(created_at DESC);