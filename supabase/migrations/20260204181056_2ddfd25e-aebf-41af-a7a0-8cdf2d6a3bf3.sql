-- Add client_id column to bank_transactions for linking expenses to clients
ALTER TABLE public.bank_transactions 
ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Add index for faster client-based queries
CREATE INDEX idx_bank_transactions_client_id ON public.bank_transactions(client_id);

-- Add comment for documentation
COMMENT ON COLUMN public.bank_transactions.client_id IS 'Optional link to client if expense/income is client-related';