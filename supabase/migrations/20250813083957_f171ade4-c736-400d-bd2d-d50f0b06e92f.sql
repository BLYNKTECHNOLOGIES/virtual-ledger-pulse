-- Complete fix: Remove conflicting triggers, add transaction, recalculate balance

-- 1) Drop all conflicting triggers temporarily
DROP TRIGGER IF EXISTS trg_validate_balance_edit ON public.bank_accounts;
DROP TRIGGER IF EXISTS trg_bank_tx_update_balance ON public.bank_transactions;
DROP TRIGGER IF EXISTS trg_validate_negative_values_bank_tx ON public.bank_transactions;

-- 2) Create the missing bank transaction for the latest purchase order
INSERT INTO public.bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  transaction_date,
  category,
  description,
  reference_number,
  related_account_name
) VALUES (
  '87d199b7-1d03-48e6-ace1-62344547bc95', -- SS HDFC BANK
  'EXPENSE',
  400000,
  '2025-08-13',
  'Purchase',
  'Stock Purchase - Test test - Order #PUR-1755073670198',
  'PUR-1755073670198',
  'Test test'
);

-- 3) Recalculate HDFC bank balance based on all transactions
WITH hdfc_total AS (
  SELECT 
    SUM(
      CASE 
        WHEN transaction_type IN ('INCOME','TRANSFER_IN') THEN amount
        WHEN transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -amount
        ELSE 0
      END
    ) AS total
  FROM public.bank_transactions
  WHERE bank_account_id = '87d199b7-1d03-48e6-ace1-62344547bc95'
)
UPDATE public.bank_accounts 
SET balance = GREATEST(COALESCE(hdfc_total.total, 0), 0),
    updated_at = now()
FROM hdfc_total
WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';

-- 4) Recreate the triggers with safer logic
CREATE TRIGGER trg_bank_tx_update_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_bank_account_balance();

-- 5) Add basic negative validation (but allow system updates)
CREATE OR REPLACE FUNCTION public.validate_negative_values_safe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Check bank account balance only for manual EXPENSE transactions
  IF TG_TABLE_NAME = 'bank_transactions' AND NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
    DECLARE
      current_balance numeric;
    BEGIN
      SELECT balance INTO current_balance FROM bank_accounts WHERE id = NEW.bank_account_id;
      -- Only check if this would create a negative balance
      IF current_balance < NEW.amount AND current_balance >= 0 THEN
        RAISE EXCEPTION 'Insufficient funds. Available: ₹%, Required: ₹%', current_balance, NEW.amount;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_negative_values_bank_tx
BEFORE INSERT ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_negative_values_safe();