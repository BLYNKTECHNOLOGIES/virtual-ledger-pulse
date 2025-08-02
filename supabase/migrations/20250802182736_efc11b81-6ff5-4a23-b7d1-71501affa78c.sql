-- First, let's see what transaction types currently exist
SELECT DISTINCT transaction_type FROM stock_transactions;

-- Update all existing transaction types to match our new constraint
UPDATE stock_transactions SET transaction_type = 'PURCHASE' WHERE transaction_type = 'PURCHASE_ORDER';
UPDATE stock_transactions SET transaction_type = 'Sales' WHERE transaction_type = 'SALES_ORDER';

-- Now apply the constraint
ALTER TABLE stock_transactions 
DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

ALTER TABLE stock_transactions 
ADD CONSTRAINT stock_transactions_transaction_type_check 
CHECK (transaction_type IN ('PURCHASE', 'SALES', 'ADJUSTMENT', 'TRANSFER', 'Sales'));