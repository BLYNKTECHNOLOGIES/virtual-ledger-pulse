
-- Create banking_credentials table
CREATE TABLE public.banking_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('Customer ID', 'Net Banking', 'Transaction Password', 'Profile Password', 'Security Question', 'UPI PIN', 'Other')),
  credential_name TEXT, -- For 'Other' type
  customer_id TEXT,
  login_id TEXT,
  password TEXT,
  transaction_password TEXT,
  profile_password TEXT,
  upi_pin TEXT,
  credential_value TEXT, -- For 'Other' type
  security_questions JSONB DEFAULT '[]'::jsonb, -- Array of {question: string, answer: string}
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.banking_credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for banking_credentials (allowing all operations for now)
CREATE POLICY "Allow all operations on banking_credentials" 
  ON public.banking_credentials 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_banking_credentials_bank_account_id ON public.banking_credentials(bank_account_id);
CREATE INDEX idx_banking_credentials_credential_type ON public.banking_credentials(credential_type);
