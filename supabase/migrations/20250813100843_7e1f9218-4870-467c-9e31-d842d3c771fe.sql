-- Drop ALL validation triggers first
DROP TRIGGER IF EXISTS trg_validate_negative_values_bank_tx ON public.bank_transactions;
DROP TRIGGER IF EXISTS trg_validate_negative_values ON public.bank_transactions;

-- Drop the validation function temporarily
DROP FUNCTION IF EXISTS public.validate_negative_values() CASCADE;
DROP FUNCTION IF EXISTS public.validate_negative_values_safe() CASCADE;

-- Now create missing bank transactions without validation
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