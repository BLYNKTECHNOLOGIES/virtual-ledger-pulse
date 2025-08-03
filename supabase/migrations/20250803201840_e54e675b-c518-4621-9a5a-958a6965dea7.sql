-- Create a function to automatically create bank transactions for completed purchase orders
CREATE OR REPLACE FUNCTION public.create_purchase_bank_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create bank transaction if purchase order is completed and has a bank account
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' AND NEW.bank_account_id IS NOT NULL THEN
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

-- Also create bank transactions for existing completed purchase orders that don't have corresponding transactions
INSERT INTO public.bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  category,
  description,
  reference_number,
  transaction_date
)
SELECT 
  po.bank_account_id,
  'EXPENSE',
  po.total_amount,
  'Purchase',
  CONCAT('Purchase Order: ', po.order_number, ' - ', COALESCE(po.description, 'Supplier: ' || po.supplier_name)),
  po.order_number,
  po.order_date
FROM public.purchase_orders po
WHERE po.status = 'COMPLETED' 
  AND po.bank_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bank_transactions bt 
    WHERE bt.reference_number = po.order_number 
      AND bt.category = 'Purchase'
  );