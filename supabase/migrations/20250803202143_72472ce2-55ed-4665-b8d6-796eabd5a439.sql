-- Create bank transactions for existing completed purchase orders WITHOUT updating balances
-- This allows them to show up in BAMS and P&L without affecting account balances
SET session_replication_role = replica;

-- Create bank transactions for existing completed purchase orders
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

-- Re-enable triggers
SET session_replication_role = DEFAULT;