-- Add foreign key constraints for created_by fields
ALTER TABLE sales_orders 
  DROP CONSTRAINT IF EXISTS sales_orders_created_by_fkey,
  ADD CONSTRAINT sales_orders_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE purchase_orders 
  DROP CONSTRAINT IF EXISTS purchase_orders_created_by_fkey,
  ADD CONSTRAINT purchase_orders_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE bank_transactions 
  DROP CONSTRAINT IF EXISTS bank_transactions_created_by_fkey,
  ADD CONSTRAINT bank_transactions_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE journal_entries 
  DROP CONSTRAINT IF EXISTS journal_entries_created_by_fkey,
  ADD CONSTRAINT journal_entries_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_by ON sales_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_created_by ON bank_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON journal_entries(created_by);