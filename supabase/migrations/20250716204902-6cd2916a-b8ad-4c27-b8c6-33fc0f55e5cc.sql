-- Remove duplicate purchase payment methods, keeping only the first one
DELETE FROM purchase_payment_methods 
WHERE id NOT IN (
  SELECT DISTINCT ON (bank_account_name, type) id 
  FROM purchase_payment_methods 
  WHERE type = 'Bank Transfer'
  ORDER BY bank_account_name, type, created_at
);

-- Now create the unique constraints
CREATE UNIQUE INDEX unique_sales_bank_account_transfer 
ON sales_payment_methods (bank_account_id) 
WHERE type = 'Bank Account';

CREATE UNIQUE INDEX unique_purchase_bank_transfer
ON purchase_payment_methods (bank_account_name)
WHERE type = 'Bank Transfer';

-- Add indexes for better performance
CREATE INDEX idx_sales_payment_methods_bank_type ON sales_payment_methods (bank_account_id, type);
CREATE INDEX idx_purchase_payment_methods_bank_type ON purchase_payment_methods (bank_account_name, type);