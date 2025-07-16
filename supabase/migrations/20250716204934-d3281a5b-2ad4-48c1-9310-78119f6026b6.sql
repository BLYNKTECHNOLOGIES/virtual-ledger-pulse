-- First, let's see what duplicates we have and their relationships
WITH duplicates AS (
  SELECT id, bank_account_name, type, created_at,
         ROW_NUMBER() OVER (PARTITION BY bank_account_name, type ORDER BY created_at) as rn
  FROM purchase_payment_methods 
  WHERE type = 'Bank Transfer'
),
to_delete AS (
  SELECT id FROM duplicates WHERE rn > 1
)
-- Update purchase orders to use the kept payment method (first one by created_at)
UPDATE purchase_orders 
SET purchase_payment_method_id = (
  SELECT id FROM purchase_payment_methods 
  WHERE bank_account_name = (
    SELECT bank_account_name 
    FROM purchase_payment_methods p2 
    WHERE p2.id = purchase_orders.purchase_payment_method_id
  ) 
  AND type = 'Bank Transfer'
  ORDER BY created_at 
  LIMIT 1
)
WHERE purchase_payment_method_id IN (SELECT id FROM to_delete);

-- Now delete the duplicates
WITH duplicates AS (
  SELECT id, bank_account_name, type, created_at,
         ROW_NUMBER() OVER (PARTITION BY bank_account_name, type ORDER BY created_at) as rn
  FROM purchase_payment_methods 
  WHERE type = 'Bank Transfer'
)
DELETE FROM purchase_payment_methods 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Create the unique constraints
CREATE UNIQUE INDEX unique_sales_bank_account_transfer 
ON sales_payment_methods (bank_account_id) 
WHERE type = 'Bank Account';

CREATE UNIQUE INDEX unique_purchase_bank_transfer
ON purchase_payment_methods (bank_account_name)
WHERE type = 'Bank Transfer';