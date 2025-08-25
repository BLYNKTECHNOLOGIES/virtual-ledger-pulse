-- Fix UPI payment methods by adding proper UPI IDs for purchase payment methods
-- Update purchase payment methods with valid UPI IDs

UPDATE purchase_payment_methods 
SET upi_id = CASE 
  WHEN bank_account_name ILIKE '%INDUSIND%' THEN 'pos.5279405@indus'
  WHEN bank_account_name ILIKE '%HDFC%' THEN 'vyapar.173031723300@hdfcbank' 
  WHEN bank_account_name ILIKE '%PNB%' OR bank_account_name ILIKE '%PUNJAB%' THEN 'pos.11375848@pnb'
  WHEN bank_account_name ILIKE '%IDBI%' THEN 'mrd18o0crm1m@idbi'
  WHEN bank_account_name ILIKE '%IDFC%' THEN 'pos.11329613@idfc'
  ELSE 'upi.default@bank'
END,
updated_at = now()
WHERE type = 'UPI' AND is_active = true AND upi_id IS NULL;