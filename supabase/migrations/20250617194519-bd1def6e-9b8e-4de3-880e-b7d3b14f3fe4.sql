
-- Create table for bank transactions
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER_IN', 'TRANSFER_OUT')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category TEXT,
  description TEXT,
  reference_number TEXT,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- For transfer transactions, link to the other account
  related_transaction_id UUID REFERENCES public.bank_transactions(id),
  -- Store the other account name for transfers
  related_account_name TEXT
);

-- Create index for faster queries
CREATE INDEX idx_bank_transactions_account_id ON public.bank_transactions(bank_account_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(transaction_date);
CREATE INDEX idx_bank_transactions_type ON public.bank_transactions(transaction_type);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since this seems to be an internal system)
CREATE POLICY "Allow all operations on bank_transactions" ON public.bank_transactions
FOR ALL USING (true) WITH CHECK (true);

-- Function to update bank account balance
CREATE OR REPLACE FUNCTION public.update_bank_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount,
          updated_at = now()
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount,
          updated_at = now()
      WHERE id = OLD.bank_account_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- First reverse the old transaction
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount
      WHERE id = OLD.bank_account_id;
    END IF;

    -- Then apply the new transaction
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update bank account balances
CREATE TRIGGER trigger_update_bank_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bank_account_balance();
