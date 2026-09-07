CREATE OR REPLACE FUNCTION public.get_buyer_onboarding_approval_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'pending', (
      SELECT count(*) FROM (
        SELECT DISTINCT lower(trim(a.client_name))
        FROM public.client_onboarding_approvals a
        LEFT JOIN public.clients c ON c.id = a.resolved_client_id
        WHERE a.approval_status = 'PENDING'
          AND NOT (COALESCE(c.is_seller, false) = true AND COALESCE(c.is_buyer, false) = false)
      ) p
    ),
    'history', (
      SELECT count(*) FROM (
        SELECT DISTINCT lower(trim(a.client_name)), trim(COALESCE(a.client_phone, ''))
        FROM public.client_onboarding_approvals a
        LEFT JOIN public.clients c ON c.id = a.resolved_client_id
        WHERE a.approval_status <> 'PENDING'
          AND NOT (COALESCE(c.is_seller, false) = true AND COALESCE(c.is_buyer, false) = false)
      ) h
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_buyer_onboarding_approval_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_buyer_onboarding_approval_counts() TO authenticated;