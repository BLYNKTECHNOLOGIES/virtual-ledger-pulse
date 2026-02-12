-- Delete the duplicate pending SHIB conversion entry
DELETE FROM public.erp_product_conversions 
WHERE id = '9a4191fa-a7a5-4fab-b712-d2b29f39b050' 
  AND status = 'PENDING_APPROVAL';