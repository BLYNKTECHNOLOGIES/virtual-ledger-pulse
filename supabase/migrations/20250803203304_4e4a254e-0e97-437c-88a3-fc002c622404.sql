-- Create bank transaction for the new purchase order and update balance

-- Create the missing bank transaction for the new purchase order
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
  AND bank_account_id IS NOT NULL;

-- Update the bank account balance
UPDATE bank_accounts 
SET balance = balance - 7200,
    updated_at = now()
WHERE id = 'b3978295-1b85-4b6c-bb26-ac1f2b14160c';

-- Recreate the trigger to handle future purchase orders automatically
CREATE OR REPLACE FUNCTION public.create_purchase_bank_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create bank transaction if purchase order is completed and has a bank account
  IF NEW.status = 'COMPLETED' AND (OLD IS NULL OR OLD.status != 'COMPLETED') AND NEW.bank_account_id IS NOT NULL THEN
    INSERT INTO public.bank_transactions (
      bank_account_id,
      transaction_type,
      amount,
      category,
      description,
      reference_number,
      transaction_date
    ) VALUES (
      NEW.bank_account_id,
      'EXPENSE',
      NEW.total_amount,
      'Purchase',
      CONCAT('Purchase Order: ', NEW.order_number, ' - Supplier: ', NEW.supplier_name),
      NEW.order_number,
      NEW.order_date
    );
    
    -- Update the bank account balance
    UPDATE public.bank_accounts 
    SET balance = balance - NEW.total_amount,
        updated_at = now()
    WHERE id = NEW.bank_account_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create the trigger
CREATE TRIGGER trigger_create_purchase_bank_transaction
  AFTER INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION create_purchase_bank_transaction();