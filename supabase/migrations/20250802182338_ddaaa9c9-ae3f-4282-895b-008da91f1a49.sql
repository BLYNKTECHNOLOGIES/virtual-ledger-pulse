-- Update the stock_transactions table check constraint to include SALES_ORDER
ALTER TABLE stock_transactions 
DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

ALTER TABLE stock_transactions 
ADD CONSTRAINT stock_transactions_transaction_type_check 
CHECK (transaction_type IN ('PURCHASE', 'SALES', 'ADJUSTMENT', 'TRANSFER', 'SALES_ORDER'));