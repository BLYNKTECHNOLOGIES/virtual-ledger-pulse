-- First, create all missing bank transactions for existing purchase orders
INSERT INTO public.bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  transaction_date,
  category,
  description,
  reference_number,
  related_account_name
)
SELECT 
  po.bank_account_id,
  'EXPENSE',
  COALESCE(po.net_payable_amount, po.total_amount),
  po.order_date,
  'Purchase',
  'Manual Purchase - ' || po.supplier_name || ' - Order #' || po.order_number,
  po.order_number,
  po.supplier_name
FROM public.purchase_orders po
WHERE po.bank_account_id IS NOT NULL
  AND po.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM public.bank_transactions bt 
    WHERE bt.reference_number = po.order_number 
    AND bt.category = 'Purchase'
  );

-- Create trigger for all sales orders to ensure bank transactions are created
CREATE OR REPLACE FUNCTION public.sync_bank_tx_for_sales_order()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  payment_method_record RECORD;
BEGIN
  -- Only process completed sales orders
  IF NEW.payment_status = 'COMPLETED' AND NEW.sales_payment_method_id IS NOT NULL THEN
    -- Get payment method details
    SELECT * INTO payment_method_record
    FROM public.sales_payment_methods
    WHERE id = NEW.sales_payment_method_id;
    
    -- Only create bank transaction if it's a direct bank payment (not payment gateway)
    IF payment_method_record.bank_account_id IS NOT NULL AND NOT COALESCE(payment_method_record.payment_gateway, false) THEN
      -- Check if bank transaction already exists
      IF NOT EXISTS (
        SELECT 1 FROM public.bank_transactions 
        WHERE reference_number = NEW.order_number AND category = 'Sales'
      ) THEN
        -- Create bank transaction
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
          payment_method_record.bank_account_id,
          'INCOME',
          NEW.total_amount,
          NEW.order_date,
          'Sales',
          'Sales Order - ' || NEW.order_number || ' - ' || NEW.client_name,
          NEW.order_number,
          NEW.client_name
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for sales orders
DROP TRIGGER IF EXISTS trg_sync_bank_tx_for_sales_order ON public.sales_orders;
CREATE TRIGGER trg_sync_bank_tx_for_sales_order
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_bank_tx_for_sales_order();

-- Now create missing bank transactions for existing sales orders
INSERT INTO public.bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  transaction_date,
  category,
  description,
  reference_number,
  related_account_name
)
SELECT 
  spm.bank_account_id,
  'INCOME',
  so.total_amount,
  so.order_date,
  'Sales',
  'Sales Order - ' || so.order_number || ' - ' || so.client_name,
  so.order_number,
  so.client_name
FROM public.sales_orders so
JOIN public.sales_payment_methods spm ON so.sales_payment_method_id = spm.id
WHERE so.payment_status = 'COMPLETED'
  AND spm.bank_account_id IS NOT NULL
  AND NOT COALESCE(spm.payment_gateway, false)
  AND NOT EXISTS (
    SELECT 1 FROM public.bank_transactions bt 
    WHERE bt.reference_number = so.order_number 
    AND bt.category = 'Sales'
  );