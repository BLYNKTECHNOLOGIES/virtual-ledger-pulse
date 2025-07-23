-- Create closed_bank_accounts table for storing closed bank account details
CREATE TABLE public.closed_bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Original bank account details
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  IFSC TEXT,
  branch TEXT,
  bank_account_holder_name TEXT,
  final_balance NUMERIC NOT NULL DEFAULT 0,
  
  -- Closure details
  closure_reason TEXT NOT NULL,
  closure_date DATE NOT NULL DEFAULT CURRENT_DATE,
  closure_documents TEXT[] DEFAULT '{}', -- Array of document URLs
  closed_by TEXT, -- Who closed the account
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.closed_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for closed_bank_accounts
CREATE POLICY "Allow all operations on closed_bank_accounts" 
ON public.closed_bank_accounts 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updating updated_at
CREATE TRIGGER update_closed_bank_accounts_updated_at
BEFORE UPDATE ON public.closed_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_closed_bank_accounts_closure_date ON public.closed_bank_accounts(closure_date);
CREATE INDEX idx_closed_bank_accounts_bank_name ON public.closed_bank_accounts(bank_name);