-- Create partial unique index for sales payment methods (bank account + type where type = 'Bank Account')
CREATE UNIQUE INDEX unique_sales_bank_account_transfer 
ON sales_payment_methods (bank_account_id) 
WHERE type = 'Bank Account';

-- Create partial unique index for purchase payment methods (bank account + type where type = 'Bank Transfer')  
CREATE UNIQUE INDEX unique_purchase_bank_transfer
ON purchase_payment_methods (bank_account_name)
WHERE type = 'Bank Transfer';

-- Add indexes for better performance
CREATE INDEX idx_sales_payment_methods_bank_type ON sales_payment_methods (bank_account_id, type);
CREATE INDEX idx_purchase_payment_methods_bank_type ON purchase_payment_methods (bank_account_name, type);