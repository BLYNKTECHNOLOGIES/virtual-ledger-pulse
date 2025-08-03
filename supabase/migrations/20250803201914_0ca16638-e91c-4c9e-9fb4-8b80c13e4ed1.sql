-- Create a function to automatically create bank transactions for completed purchase orders
-- This version will NOT trigger balance updates to avoid the lock conflict
CREATE OR REPLACE FUNCTION public.create_purchase_bank_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create bank transaction if purchase order is completed and has a bank account
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' AND NEW.bank_account_id IS NOT NULL THEN
    -- Temporarily disable the balance update trigger to avoid conflict
    SET session_replication_role = replica;
    
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
      CONCAT('Purchase Order: ', NEW.order_number, ' - ', COALESCE(NEW.description, 'Supplier: ' || NEW.supplier_name)),
      NEW.order_number,
      NEW.order_date
    );
    
    -- Manually update the bank account balance
    UPDATE public.bank_accounts 
    SET balance = balance - NEW.total_amount,
        updated_at = now()
    WHERE id = NEW.bank_account_id;
    
    -- Re-enable triggers
    SET session_replication_role = DEFAULT;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for purchase orders
DROP TRIGGER IF EXISTS trigger_create_purchase_bank_transaction ON public.purchase_orders;
CREATE TRIGGER trigger_create_purchase_bank_transaction
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_purchase_bank_transaction();