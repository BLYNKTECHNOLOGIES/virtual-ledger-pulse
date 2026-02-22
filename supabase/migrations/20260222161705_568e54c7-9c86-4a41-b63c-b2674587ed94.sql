
-- Reset recently auto-approved sellers back to PENDING so they appear in Seller Approvals
-- Only reset those that were auto-approved (kyc_status still PENDING means they were never manually approved)
UPDATE public.clients
SET seller_approval_status = 'PENDING',
    seller_approved_at = NULL
WHERE is_seller = true
  AND seller_approval_status = 'APPROVED'
  AND kyc_status = 'PENDING'
  AND is_deleted = false;
