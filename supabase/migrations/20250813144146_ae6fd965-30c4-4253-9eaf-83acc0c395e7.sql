-- Temporarily remove constraint and clear data

-- Drop the constraint that's causing issues
ALTER TABLE bank_accounts DROP CONSTRAINT IF EXISTS check_bank_balance_reasonable;

-- Now clear all the data
DELETE FROM purchase_order_items;
DELETE FROM journal_entry_lines;
DELETE FROM purchase_orders;
DELETE FROM journal_entries;
DELETE FROM bank_transactions;
DELETE FROM stock_transactions;
DELETE FROM wallet_transactions WHERE true;

-- Clear sales data
DELETE FROM sales_order_items WHERE true;
DELETE FROM sales_orders WHERE true;

-- Clear payment gateway data
DELETE FROM payment_gateway_settlement_items WHERE true;
DELETE FROM payment_gateway_settlements WHERE true;

-- Reset all balances to 0
UPDATE bank_accounts 
SET 
  balance = 0,
  balance_locked = false,
  updated_at = now();

UPDATE wallets 
SET 
  current_balance = 0,
  total_received = 0,
  total_sent = 0,
  updated_at = now()
WHERE true;

UPDATE products 
SET 
  current_stock_quantity = 0,
  total_purchases = 0,
  updated_at = now();

UPDATE ledger_accounts 
SET 
  current_balance = opening_balance,
  updated_at = now();

-- Recreate the constraint with reasonable limits
ALTER TABLE bank_accounts 
ADD CONSTRAINT check_bank_balance_reasonable 
CHECK (balance >= -10000000 AND balance <= 10000000);