-- Create the missing bank transaction for the completed purchase order
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
  '997b3f8e-3479-46e9-865f-5c20f3cd2937',
  'EXPENSE',
  4500,
  '2025-08-13',
  'Purchase',
  'Stock Purchase - ram - Order #PUR-1755080623731',
  'PUR-1755080623731',
  'ram'
);

-- Check if the trigger exists and is active
SELECT 
  tgname, 
  tgenabled,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger 
WHERE tgrelid = 'purchase_orders'::regclass;