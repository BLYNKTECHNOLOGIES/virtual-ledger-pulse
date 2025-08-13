-- Manual fix: Create missing bank transaction and recalculate balance for HDFC

-- 1) Create the missing bank transaction for the latest purchase order
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

-- 2) Immediately recalculate HDFC bank balance based on all transactions
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