
-- Archive all existing PENDING entries before Feb 12, 2026
-- These have already been handled in ERP manually
UPDATE public.erp_action_queue
SET status = 'ARCHIVED',
    reject_reason = 'Pre-system entries already processed in ERP before Feb 12, 2026',
    processed_at = now()
WHERE status = 'PENDING'
AND movement_time < extract(epoch from '2026-02-12T00:00:00+05:30'::timestamptz) * 1000;
