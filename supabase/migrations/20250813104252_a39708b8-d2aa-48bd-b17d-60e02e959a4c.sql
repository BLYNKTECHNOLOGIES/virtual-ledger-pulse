-- Temporarily unlock the bank account for testing
UPDATE public.bank_accounts 
SET balance_locked = false 
WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';

-- Test the new manual purchase order to verify bank balance deduction (with unlocked account)
INSERT INTO public.purchase_orders (
  order_number,
  supplier_name,
  order_date,
  status,
  total_amount,
  net_payable_amount,
  bank_account_id
) VALUES (
  'TEST-MANUAL-FINAL-' || extract(epoch from now())::text,
  'Test Final Purchase',
  CURRENT_DATE,
  'COMPLETED',
  1500,
  1500,
  '87d199b7-1d03-48e6-ace1-62344547bc95' -- SS HDFC BANK account
);

-- Check current balance and recent transactions
SELECT 
  account_name, 
  balance, 
  balance_locked 
FROM bank_accounts 
WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';

-- Check recent bank transactions for this account
SELECT 
  transaction_type,
  amount,
  description,
  created_at
FROM bank_transactions 
WHERE bank_account_id = '87d199b7-1d03-48e6-ace1-62344547bc95'
ORDER BY created_at DESC 
LIMIT 3;