-- Test the new manual purchase order to verify bank balance deduction (corrected)
INSERT INTO public.purchase_orders (
  order_number,
  supplier_name,
  order_date,
  status,
  total_amount,
  net_payable_amount,
  bank_account_id
) VALUES (
  'TEST-MANUAL-' || extract(epoch from now())::text,
  'Test Supplier Manual',
  CURRENT_DATE,
  'COMPLETED',
  2000,
  2000,
  '87d199b7-1d03-48e6-ace1-62344547bc95' -- SS HDFC BANK account
);

-- Check current balance after the test
SELECT account_name, balance FROM bank_accounts WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';