-- Ensure triggers exist to keep bank account balances in sync with bank_transactions
-- and to prevent invalid states. Also backfill current balances from existing transactions.

-- 1) Create trigger to update bank account balance after any bank transaction change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_bank_balance_after_bank_tx'
  ) THEN
    CREATE TRIGGER trg_update_bank_balance_after_bank_tx
    AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_bank_account_balance();
  END IF;
END
$$;

-- 2) Validate negative values before inserting/updating bank transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_negative_values_on_bank_tx'
  ) THEN
    CREATE TRIGGER trg_validate_negative_values_on_bank_tx
    BEFORE INSERT OR UPDATE ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_negative_values();
  END IF;
END
$$;

-- 3) Lock bank account balance after a transaction is created (first transaction)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lock_balance_after_tx'
  ) THEN
    CREATE TRIGGER trg_lock_balance_after_tx
    AFTER INSERT ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();
  END IF;
END
$$;

-- 4) Prevent direct balance edits when account is locked
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_balance_edit'
  ) THEN
    CREATE TRIGGER trg_validate_balance_edit
    BEFORE UPDATE ON public.bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_balance_edit();
  END IF;
END
$$;

-- 5) Backfill: Recalculate existing bank account balances from bank_transactions
WITH totals AS (
  SELECT 
    bank_account_id,
    SUM(
      CASE 
        WHEN transaction_type IN ('INCOME','TRANSFER_IN') THEN amount
        WHEN transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -amount
        ELSE 0
      END
    ) AS total
  FROM public.bank_transactions
  GROUP BY bank_account_id
)
UPDATE public.bank_accounts b
SET balance = COALESCE(t.total, 0),
    updated_at = now()
FROM totals t
WHERE b.id = t.bank_account_id;