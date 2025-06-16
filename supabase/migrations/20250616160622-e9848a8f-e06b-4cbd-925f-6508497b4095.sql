
-- Remove the name column from purchase_payment_methods table since it's not needed
ALTER TABLE purchase_payment_methods DROP COLUMN IF EXISTS name;

-- Add type column to specify payment method type (UPI or Bank Transfer)
ALTER TABLE purchase_payment_methods ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'Bank Transfer';

-- Ensure we have the bank_account_id foreign key relationship
ALTER TABLE purchase_payment_methods 
ADD CONSTRAINT fk_purchase_payment_methods_bank_account 
FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_payment_methods_bank_account_id 
ON purchase_payment_methods(bank_account_id);

-- Add index for active payment methods
CREATE INDEX IF NOT EXISTS idx_purchase_payment_methods_active 
ON purchase_payment_methods(is_active);
