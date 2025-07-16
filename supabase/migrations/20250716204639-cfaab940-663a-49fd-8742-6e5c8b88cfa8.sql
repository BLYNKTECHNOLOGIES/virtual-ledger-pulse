-- Add constraint to ensure one bank account can only have one bank transfer method for sales
ALTER TABLE sales_payment_methods 
ADD CONSTRAINT unique_bank_account_transfer 
UNIQUE (bank_account_id, type) 
WHERE type = 'Bank Account';

-- Add constraint for purchase payment methods  
ALTER TABLE purchase_payment_methods
ADD CONSTRAINT unique_bank_account_purchase_transfer
UNIQUE (bank_account_name, type)
WHERE type = 'Bank Transfer';

-- Add indexes for better performance
CREATE INDEX idx_sales_payment_methods_bank_type ON sales_payment_methods (bank_account_id, type);
CREATE INDEX idx_purchase_payment_methods_bank_type ON purchase_payment_methods (bank_account_name, type);