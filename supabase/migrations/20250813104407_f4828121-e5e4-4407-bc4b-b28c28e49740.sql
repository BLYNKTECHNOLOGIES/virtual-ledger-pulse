-- Manually test creating a bank transaction to see current balance deduction
INSERT INTO public.bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  description,
  reference_number,
  transaction_date
) VALUES (
  '87d199b7-1d03-48e6-ace1-62344547bc95',
  'EXPENSE',
  500,
  'Manual test purchase transaction',
  'TEST-MANUAL-TX-' || extract(epoch from now())::text,
  CURRENT_DATE
);

-- Check balance after manual transaction
SELECT 
  account_name, 
  balance, 
  balance_locked
FROM bank_accounts 
WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';