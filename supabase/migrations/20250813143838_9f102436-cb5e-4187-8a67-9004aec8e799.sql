-- Temporarily disable constraints and clear all data

-- Disable triggers that might cause constraint violations
ALTER TABLE bank_accounts DISABLE TRIGGER ALL;
ALTER TABLE wallets DISABLE TRIGGER ALL;

-- First, delete all dependent records in the correct order
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;

-- Delete sales order related data if exists
DELETE FROM sales_order_items WHERE true;
DELETE FROM sales_orders WHERE true;

-- Delete payment gateway data
DELETE FROM payment_gateway_settlement_items;
DELETE FROM payment_gateway_settlements;

-- Delete journal entry lines first, then entries
DELETE FROM journal_entry_lines;
DELETE FROM journal_entries;

-- Clear all transaction data
DELETE FROM stock_transactions;
DELETE FROM wallet_transactions;
DELETE FROM bank_transactions;

-- Now safely reset balances without triggers
UPDATE bank_accounts 
SET 
  balance = 0,
  balance_locked = false,
  updated_at = now();

-- Reset wallet balances
UPDATE wallets 
SET 
  current_balance = 0,
  total_received = 0,
  total_sent = 0,
  updated_at = now()
WHERE true;

-- Reset product stock
UPDATE products 
SET 
  current_stock_quantity = 0,
  total_purchases = 0,
  updated_at = now();

-- Reset ledger accounts to opening balance
UPDATE ledger_accounts 
SET 
  current_balance = opening_balance,
  updated_at = now();

-- Re-enable triggers
ALTER TABLE bank_accounts ENABLE TRIGGER ALL;
ALTER TABLE wallets ENABLE TRIGGER ALL;