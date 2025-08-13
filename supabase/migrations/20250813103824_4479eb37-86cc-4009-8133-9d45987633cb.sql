-- Test manual purchase order creation to verify bank balance deduction
INSERT INTO public.purchase_orders (
  order_number,
  supplier_name,
  order_date,
  status,
  total_amount,
  net_payable_amount,
  bank_account_id,
  payment_status,
  notes
) VALUES (
  'TEST-' || extract(epoch from now())::text,
  'Test Supplier',
  CURRENT_DATE,
  'COMPLETED',
  1000,
  1000,
  '87d199b7-1d03-48e6-ace1-62344547bc95', -- SS HDFC BANK account
  'COMPLETED',
  'Test purchase to verify bank balance deduction'
);

-- Check current balance after the test purchase
SELECT account_name, balance FROM bank_accounts WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';