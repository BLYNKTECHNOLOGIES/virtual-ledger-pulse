-- Clear all purchase and sales data step by step

-- Step 1: Delete dependent records first
DELETE FROM purchase_order_items;
DELETE FROM journal_entry_lines;

-- Step 2: Delete main records
DELETE FROM purchase_orders;
DELETE FROM journal_entries;

-- Step 3: Clear transactions (this should help with balance calculations)
DELETE FROM bank_transactions;
DELETE FROM stock_transactions;

-- Step 4: Reset balances manually by setting them directly
UPDATE bank_accounts 
SET 
  balance = 0,
  balance_locked = false,
  updated_at = now();

-- Step 5: Reset product stock
UPDATE products 
SET 
  current_stock_quantity = 0,
  total_purchases = 0,
  updated_at = now();

-- Step 6: Clear wallet data if exists
DELETE FROM wallet_transactions WHERE true;

UPDATE wallets 
SET 
  current_balance = 0,
  total_received = 0,
  total_sent = 0,
  updated_at = now()
WHERE true;

-- Step 7: Reset ledger accounts
UPDATE ledger_accounts 
SET 
  current_balance = opening_balance,
  updated_at = now();

-- Step 8: Clear sales data if exists
DELETE FROM sales_order_items WHERE true;
DELETE FROM sales_orders WHERE true;

-- Step 9: Clear payment gateway data
DELETE FROM payment_gateway_settlement_items WHERE true;
DELETE FROM payment_gateway_settlements WHERE true;