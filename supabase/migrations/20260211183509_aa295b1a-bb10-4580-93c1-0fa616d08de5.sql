
-- BEFORE INSERT trigger: auto-populate balance_before and balance_after
-- This makes closing balances ABSOLUTE and DB-guaranteed
CREATE OR REPLACE FUNCTION public.set_wallet_transaction_balances()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  current_bal NUMERIC;
BEGIN
  -- Get the wallet's current_balance BEFORE this transaction is applied
  SELECT current_balance INTO current_bal
  FROM public.wallets
  WHERE id = NEW.wallet_id
  FOR UPDATE; -- Lock the row to prevent race conditions

  IF current_bal IS NULL THEN
    current_bal := 0;
  END IF;

  -- Set balance_before to the wallet's current balance
  NEW.balance_before := current_bal;

  -- Calculate balance_after based on transaction type
  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    NEW.balance_after := current_bal + NEW.amount;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
    NEW.balance_after := current_bal - NEW.amount;
  ELSE
    -- Unknown type, just keep current balance
    NEW.balance_after := current_bal;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create the BEFORE INSERT trigger (runs BEFORE update_wallet_balance which is AFTER INSERT)
DROP TRIGGER IF EXISTS set_wallet_transaction_balances_trigger ON public.wallet_transactions;
CREATE TRIGGER set_wallet_transaction_balances_trigger
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_wallet_transaction_balances();

-- Fix the 48 existing records with balance_before=0 AND balance_after=0
-- We recalculate them by replaying the transaction history in chronological order per wallet
DO $$
DECLARE
  w_record RECORD;
  t_record RECORD;
  running_balance NUMERIC;
BEGIN
  -- For each wallet
  FOR w_record IN SELECT DISTINCT wallet_id FROM wallet_transactions WHERE balance_before = 0 AND balance_after = 0
  LOOP
    -- Get the running balance by replaying ALL transactions for this wallet in order
    running_balance := 0;
    
    FOR t_record IN 
      SELECT id, transaction_type, amount, balance_before, balance_after
      FROM wallet_transactions
      WHERE wallet_id = w_record.wallet_id
      ORDER BY created_at ASC, id ASC
    LOOP
      -- If this record has correct balances, use its balance_after as the running balance
      IF t_record.balance_before != 0 OR t_record.balance_after != 0 THEN
        running_balance := t_record.balance_after;
      ELSE
        -- This is a zero record, fix it
        UPDATE wallet_transactions 
        SET balance_before = running_balance,
            balance_after = CASE 
              WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN running_balance + amount
              WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN running_balance - amount
              ELSE running_balance
            END
        WHERE id = t_record.id;
        
        -- Update running balance
        IF t_record.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
          running_balance := running_balance + t_record.amount;
        ELSIF t_record.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
          running_balance := running_balance - t_record.amount;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;
