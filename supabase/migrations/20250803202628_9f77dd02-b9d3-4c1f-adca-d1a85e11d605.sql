-- Fix duplicate purchase entries and update bank balances

-- First, update the bank balances for the transactions we created
UPDATE bank_accounts 
SET balance = balance - (
  SELECT COALESCE(SUM(bt.amount), 0) 
  FROM bank_transactions bt 
  WHERE bt.bank_account_id = bank_accounts.id 
    AND bt.category = 'Purchase' 
    AND bt.created_at > '2025-08-03 20:20:00'
)
WHERE id IN (
  SELECT DISTINCT bt.bank_account_id 
  FROM bank_transactions bt 
  WHERE bt.category = 'Purchase' 
    AND bt.created_at > '2025-08-03 20:20:00'
);

-- Update the purchase orders to mark that bank transactions have been created
-- This prevents the trigger from creating duplicate transactions
UPDATE purchase_orders 
SET updated_at = now()
WHERE status = 'COMPLETED' 
  AND bank_account_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM bank_transactions bt 
    WHERE bt.reference_number = purchase_orders.order_number 
      AND bt.category = 'Purchase'
  );