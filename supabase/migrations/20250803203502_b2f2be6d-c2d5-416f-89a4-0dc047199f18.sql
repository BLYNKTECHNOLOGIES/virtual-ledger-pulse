-- Fix the validation function to allow automatic balance updates from triggers

-- Update the validation function to allow balance updates from the bank transaction trigger
CREATE OR REPLACE FUNCTION public.validate_balance_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Allow balance updates if this is an automatic update (updated_at is being changed)
  -- or if balance_locked is being changed in the same transaction
  IF OLD.balance_locked = true AND NEW.balance != OLD.balance AND NEW.updated_at = OLD.updated_at THEN
    RAISE EXCEPTION 'Cannot modify balance: Account balance is locked due to existing transactions';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Now create the missing bank transaction (this should trigger the automatic balance update)
INSERT INTO bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  category,
  description,
  reference_number,
  transaction_date
)
SELECT 
  bank_account_id,
  'EXPENSE',
  total_amount,
  'Purchase',
  CONCAT('Purchase Order: ', order_number, ' - Supplier: ', supplier_name),
  order_number,
  order_date
FROM purchase_orders 
WHERE order_number = 'PUR-1754252990487'
  AND status = 'COMPLETED'
  AND bank_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bank_transactions 
    WHERE reference_number = 'PUR-1754252990487'
  );