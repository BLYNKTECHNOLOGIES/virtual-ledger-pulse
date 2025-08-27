-- Update completed purchase orders to set bank_account_id based on payment method used
UPDATE purchase_orders 
SET bank_account_id = (
  SELECT ba.id 
  FROM bank_accounts ba, purchase_payment_methods ppm 
  WHERE ba.account_name = ppm.bank_account_name 
    AND ppm.id::text = purchase_orders.payment_method_used
)
WHERE status = 'COMPLETED' 
  AND bank_account_id IS NULL 
  AND payment_method_used IS NOT NULL;