-- Update completed purchase orders to set bank_account_id based on payment method used
UPDATE purchase_orders 
SET bank_account_id = (
  SELECT ba.id 
  FROM bank_accounts ba, purchase_payment_methods ppm 
  WHERE ba.account_name = ppm.bank_account_name 
    AND ppm.id = purchase_orders.payment_method_used
)
WHERE status = 'COMPLETED' 
  AND bank_account_id IS NULL 
  AND payment_method_used IS NOT NULL;

-- Show the updated records
SELECT 
  po.order_number,
  po.supplier_name,
  ba.account_name as bank_account_name,
  ba.bank_name
FROM purchase_orders po
LEFT JOIN bank_accounts ba ON po.bank_account_id = ba.id
WHERE po.status = 'COMPLETED'
  AND po.order_number IN ('hgf', 'kj', 'hy', 'wdwq', '213312', 'Bhav', '1222', '232323')
ORDER BY po.created_at DESC;