-- Fix C: remove client_binance_nicknames rows that point at still-PENDING clients.
-- These were created by the old auto-sync path and now cause self-matches in the
-- Approvals queue ("Known Client" badge pointing at the same pending row).
-- The legitimate operator-approval flow re-inserts them at approve-time.
DELETE FROM public.client_binance_nicknames n
USING public.clients c
WHERE n.client_id = c.id
  AND c.is_deleted = false
  AND (
    (c.seller_approval_status = 'PENDING' AND c.buyer_approval_status IS DISTINCT FROM 'APPROVED')
    OR (c.buyer_approval_status = 'PENDING' AND c.seller_approval_status IS DISTINCT FROM 'APPROVED')
  );

-- Same cleanup for verified-name links (same self-match risk).
DELETE FROM public.client_verified_names v
USING public.clients c
WHERE v.client_id = c.id
  AND c.is_deleted = false
  AND v.source = 'auto_sync'
  AND (
    (c.seller_approval_status = 'PENDING' AND c.buyer_approval_status IS DISTINCT FROM 'APPROVED')
    OR (c.buyer_approval_status = 'PENDING' AND c.seller_approval_status IS DISTINCT FROM 'APPROVED')
  );