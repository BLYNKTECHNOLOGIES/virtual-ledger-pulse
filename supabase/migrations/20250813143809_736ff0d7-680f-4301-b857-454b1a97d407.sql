-- Clear all purchase and sales order data and reset bank balances

-- First, delete purchase order items (child records)
DELETE FROM purchase_order_items;

-- Delete purchase orders
DELETE FROM purchase_orders;

-- Delete sales order items if they exist
DELETE FROM sales_order_items WHERE true;

-- Delete sales orders if they exist
DELETE FROM sales_orders WHERE true;

-- Delete payment gateway settlement items
DELETE FROM payment_gateway_settlement_items;

-- Delete payment gateway settlements
DELETE FROM payment_gateway_settlements;

-- Clear all bank transactions
DELETE FROM bank_transactions;

-- Reset all bank account balances to 0
UPDATE bank_accounts 
SET 
  balance = 0,
  balance_locked = false,
  updated_at = now();

-- Reset wallet balances to 0
UPDATE wallets 
SET 
  current_balance = 0,
  total_received = 0,
  total_sent = 0,
  updated_at = now()
WHERE true;

-- Reset product stock quantities to 0
UPDATE products 
SET 
  current_stock_quantity = 0,
  total_purchases = 0,
  updated_at = now();

-- Clear stock transactions
DELETE FROM stock_transactions;

-- Clear wallet transactions
DELETE FROM wallet_transactions;

-- Clear journal entries and their lines
DELETE FROM journal_entry_lines;
DELETE FROM journal_entries;

-- Reset ledger account balances
UPDATE ledger_accounts 
SET 
  current_balance = opening_balance,
  updated_at = now();