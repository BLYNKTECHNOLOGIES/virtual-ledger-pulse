
-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_number TEXT,
  estimated_order_value NUMERIC DEFAULT 0,
  source TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create lien_cases table
CREATE TABLE public.lien_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lien_number TEXT NOT NULL UNIQUE,
  bank_account_id UUID REFERENCES bank_accounts(id),
  date_imposed DATE NOT NULL,
  acknowledgment_number TEXT,
  lawyer TEXT,
  amount NUMERIC NOT NULL,
  city TEXT,
  state TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create lien_updates table for tracking timeline
CREATE TABLE public.lien_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lien_case_id UUID REFERENCES lien_cases(id) NOT NULL,
  update_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT
);

-- Create bank_communications table
CREATE TABLE public.bank_communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  mode TEXT NOT NULL,
  notes TEXT,
  communication_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for the new tables
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lien_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lien_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_communications ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing all operations for now - can be restricted later with auth)
CREATE POLICY "Allow all operations on leads" ON public.leads FOR ALL USING (true);
CREATE POLICY "Allow all operations on lien_cases" ON public.lien_cases FOR ALL USING (true);
CREATE POLICY "Allow all operations on lien_updates" ON public.lien_updates FOR ALL USING (true);
CREATE POLICY "Allow all operations on bank_communications" ON public.bank_communications FOR ALL USING (true);
