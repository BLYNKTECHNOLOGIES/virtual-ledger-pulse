-- Fix existing seller clients that were auto-created without proper flags
UPDATE clients 
SET 
  is_seller = true, 
  seller_approval_status = CASE 
    WHEN kyc_status = 'VERIFIED' THEN 'APPROVED' 
    WHEN kyc_status = 'REJECTED' THEN 'REJECTED' 
    ELSE 'PENDING' 
  END
WHERE client_type = 'SELLER' AND (is_seller = false OR is_seller IS NULL);

-- Fix existing buyer clients that were auto-created without proper flags
UPDATE clients 
SET 
  is_buyer = true, 
  buyer_approval_status = CASE 
    WHEN kyc_status = 'VERIFIED' THEN 'APPROVED' 
    WHEN kyc_status = 'REJECTED' THEN 'REJECTED' 
    ELSE 'PENDING' 
  END
WHERE client_type = 'BUYER' AND (is_buyer = false OR is_buyer IS NULL);