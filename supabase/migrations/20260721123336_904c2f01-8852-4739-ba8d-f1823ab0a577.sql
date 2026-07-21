
-- Cleanup orphan client rows created by earlier REJECTED onboarding approvals for Fiza Ajit Shaikh,
-- so the current PENDING approval can Link & Approve cleanly without a phone-duplicate error.
UPDATE public.clients
SET is_deleted = true, deleted_at = now()
WHERE id IN ('06409096-ef9b-43b4-869a-ffc5326c481c','38ebdba7-005f-4e5c-9bba-c46faae694be')
  AND is_deleted = false;

-- Also detach the rejected approval rows from those (now-deleted) client ids so nothing points back.
UPDATE public.client_onboarding_approvals
SET resolved_client_id = NULL
WHERE id IN ('6ed2daba-5e2e-4dec-97be-49a630cf4db4','5e3b9c77-548b-4c33-9f07-276ddd938ce0');
