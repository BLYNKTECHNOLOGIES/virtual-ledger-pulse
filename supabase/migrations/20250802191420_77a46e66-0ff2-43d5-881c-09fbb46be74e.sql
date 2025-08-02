-- Add a unique constraint to prevent duplicate stock transactions
-- Based on: transaction_type, supplier_customer_name, quantity, unit_price, total_amount, reference_number, transaction_date
CREATE UNIQUE INDEX idx_stock_transactions_unique 
ON stock_transactions (
  transaction_type,
  COALESCE(supplier_customer_name, ''),
  quantity,
  unit_price,
  total_amount,
  COALESCE(reference_number, ''),
  transaction_date
);

-- Add a comment to explain the constraint
COMMENT ON INDEX idx_stock_transactions_unique IS 
'Prevents duplicate stock transactions with identical key attributes';