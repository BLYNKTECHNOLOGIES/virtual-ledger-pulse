-- Remove phantom pending onboarding approvals: rows that carry no real order
-- (no linked sales order and zero order amount) and no KYC/document data. These
-- placeholder rows only inflate the pending count and the per-client "N orders"
-- badge without ever surfacing in Review.
DELETE FROM public.client_onboarding_approvals a
WHERE a.approval_status = 'PENDING'
  AND a.sales_order_id IS NULL
  AND COALESCE(a.order_amount, 0) = 0
  AND a.aadhar_front_url IS NULL
  AND a.aadhar_back_url IS NULL
  AND a.binance_id_screenshot_url IS NULL
  AND a.additional_documents_url IS NULL
  AND a.vkyc_recording_url IS NULL
  AND a.binance_nickname IS NULL
  AND a.verified_name IS NULL
  -- keep it only if it is the ONLY pending row for that client_name (avoid deleting
  -- a legitimately empty sole record); delete when a real sibling exists.
  AND EXISTS (
    SELECT 1 FROM public.client_onboarding_approvals b
    WHERE b.approval_status = 'PENDING'
      AND lower(trim(b.client_name)) = lower(trim(a.client_name))
      AND b.id <> a.id
      AND (b.sales_order_id IS NOT NULL OR COALESCE(b.order_amount, 0) > 0)
  );