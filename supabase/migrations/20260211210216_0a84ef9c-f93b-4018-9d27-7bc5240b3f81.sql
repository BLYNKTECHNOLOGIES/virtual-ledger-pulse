
-- Create wallet_asset_balances table for per-asset balance tracking
CREATE TABLE IF NOT EXISTS public.wallet_asset_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL DEFAULT 'USDT',
  balance NUMERIC NOT NULL DEFAULT 0,
  total_received NUMERIC NOT NULL DEFAULT 0,
  total_sent NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_id, asset_code)
);

ALTER TABLE public.wallet_asset_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wallet asset balances"
ON public.wallet_asset_balances FOR SELECT USING (true);

CREATE POLICY "Anyone can insert wallet asset balances"
ON public.wallet_asset_balances FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update wallet asset balances"
ON public.wallet_asset_balances FOR UPDATE USING (true);

-- Seed existing data from wallet_transactions
INSERT INTO public.wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
SELECT 
  wallet_id,
  asset_code,
  COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE -amount END), 0) as balance,
  COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE 0 END), 0) as total_received,
  COALESCE(SUM(CASE WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN amount ELSE 0 END), 0) as total_sent
FROM public.wallet_transactions
GROUP BY wallet_id, asset_code
ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
  balance = EXCLUDED.balance,
  total_received = EXCLUDED.total_received,
  total_sent = EXCLUDED.total_sent,
  updated_at = now();

-- Update the BEFORE INSERT trigger to be asset-aware
CREATE OR REPLACE FUNCTION public.set_wallet_transaction_balances()
RETURNS TRIGGER AS $$
DECLARE
  current_asset_bal NUMERIC;
BEGIN
  -- Get the asset-specific balance from wallet_asset_balances
  SELECT balance INTO current_asset_bal
  FROM public.wallet_asset_balances
  WHERE wallet_id = NEW.wallet_id AND asset_code = NEW.asset_code
  FOR UPDATE;

  IF current_asset_bal IS NULL THEN
    current_asset_bal := 0;
  END IF;

  NEW.balance_before := current_asset_bal;

  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    NEW.balance_after := current_asset_bal + NEW.amount;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
    NEW.balance_after := current_asset_bal - NEW.amount;
  ELSE
    NEW.balance_after := current_asset_bal;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update the AFTER INSERT/DELETE trigger to maintain wallet_asset_balances
CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Update per-asset balance
    INSERT INTO public.wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (
      NEW.wallet_id, 
      NEW.asset_code,
      CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE -NEW.amount END,
      CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE 0 END,
      CASE WHEN NEW.transaction_type IN ('DEBIT','TRANSFER_OUT') THEN NEW.amount ELSE 0 END
    )
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE -NEW.amount END,
      total_received = wallet_asset_balances.total_received + CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE 0 END,
      total_sent = wallet_asset_balances.total_sent + CASE WHEN NEW.transaction_type IN ('DEBIT','TRANSFER_OUT') THEN NEW.amount ELSE 0 END,
      updated_at = now();

    -- Also update legacy wallets.current_balance for USDT (backward compat)
    IF NEW.asset_code = 'USDT' THEN
      IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance + NEW.amount,
            total_received = total_received + NEW.amount,
            updated_at = now()
        WHERE id = NEW.wallet_id;
      ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance - NEW.amount,
            total_sent = total_sent + NEW.amount,
            updated_at = now()
        WHERE id = NEW.wallet_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Reverse per-asset balance
    UPDATE public.wallet_asset_balances SET
      balance = balance - CASE WHEN OLD.transaction_type IN ('CREDIT','TRANSFER_IN') THEN OLD.amount ELSE -OLD.amount END,
      total_received = total_received - CASE WHEN OLD.transaction_type IN ('CREDIT','TRANSFER_IN') THEN OLD.amount ELSE 0 END,
      total_sent = total_sent - CASE WHEN OLD.transaction_type IN ('DEBIT','TRANSFER_OUT') THEN OLD.amount ELSE 0 END,
      updated_at = now()
    WHERE wallet_id = OLD.wallet_id AND asset_code = OLD.asset_code;

    -- Also update legacy wallets.current_balance for USDT
    IF OLD.asset_code = 'USDT' THEN
      IF OLD.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance - OLD.amount,
            total_received = total_received - OLD.amount,
            updated_at = now()
        WHERE id = OLD.wallet_id;
      ELSIF OLD.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance + OLD.amount,
            total_sent = total_sent - OLD.amount,
            updated_at = now()
        WHERE id = OLD.wallet_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;
