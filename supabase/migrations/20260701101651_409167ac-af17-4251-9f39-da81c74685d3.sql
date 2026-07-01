WITH latest_logs AS (
  SELECT DISTINCT ON (l.entity_id)
    l.entity_id,
    l.user_id,
    l.recorded_at
  FROM public.system_action_logs l
  WHERE l.action_type IN ('client.buyer_approved', 'client.buyer_rejected')
    AND l.entity_type = 'client_onboarding'
    AND l.user_id IS NOT NULL
  ORDER BY l.entity_id, l.recorded_at DESC
)
UPDATE public.client_onboarding_approvals coa
SET
  reviewed_by = ll.user_id,
  reviewed_at = COALESCE(coa.reviewed_at, ll.recorded_at)
FROM latest_logs ll
WHERE coa.id = ll.entity_id
  AND coa.reviewed_by IS NULL;