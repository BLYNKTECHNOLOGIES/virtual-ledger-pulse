-- Create bank transactions for existing completed purchase orders that don't have corresponding transactions
-- This handles the user's completed purchase orders
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
  CONCAT('Purchase Order: ', po.order_number, ' - Supplier: ', po.supplier_name),
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

-- Manually update bank account balances for these transactions
-- since we're bypassing the trigger
UPDATE public.bank_accounts ba
SET balance = balance - po_total.total_expense,
    updated_at = now()
FROM (
  SELECT 
    po.bank_account_id,
    SUM(po.total_amount) as total_expense
  FROM public.purchase_orders po
  WHERE po.status = 'COMPLETED' 
    AND po.bank_account_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bank_transactions bt 
      WHERE bt.reference_number = po.order_number 
        AND bt.category = 'Purchase'
        AND bt.created_at > now() - interval '1 minute'  -- Only recent ones we just added
    )
  GROUP BY po.bank_account_id
) po_total
WHERE ba.id = po_total.bank_account_id;