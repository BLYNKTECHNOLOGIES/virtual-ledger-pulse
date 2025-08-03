-- Remove all purchase entries and fix bank balance constraint

-- First, restore bank balances by adding back the amounts that were deducted by purchase transactions
UPDATE bank_accounts 
SET balance = balance + (
  SELECT COALESCE(SUM(bt.amount), 0) 
  FROM bank_transactions bt 
  WHERE bt.bank_account_id = bank_accounts.id 
    AND bt.category = 'Purchase'
)
WHERE id IN (
  SELECT DISTINCT bt.bank_account_id 
  FROM bank_transactions bt 
  WHERE bt.category = 'Purchase'
);

-- Now delete all purchase transactions
DELETE FROM bank_transactions 
WHERE category = 'Purchase';

-- Update the trigger to not create bank transactions for purchase orders
DROP TRIGGER IF EXISTS create_purchase_bank_transaction ON purchase_orders;

-- Remove the problematic function
DROP FUNCTION IF EXISTS public.create_purchase_bank_transaction();