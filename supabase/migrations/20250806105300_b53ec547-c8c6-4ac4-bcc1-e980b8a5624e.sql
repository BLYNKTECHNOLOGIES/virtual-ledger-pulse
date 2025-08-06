-- Add fields for bank accounts and operator notes to clients table
ALTER TABLE public.clients 
ADD COLUMN linked_bank_accounts jsonb DEFAULT '[]'::jsonb,
ADD COLUMN operator_notes text;