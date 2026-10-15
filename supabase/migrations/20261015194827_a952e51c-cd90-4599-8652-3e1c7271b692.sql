CREATE OR REPLACE FUNCTION public.terminal_editable_user_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT u.user_id), '{}')
  FROM (SELECT user_id FROM public.p2p_terminal_user_roles
        UNION SELECT user_id FROM public.terminal_user_profiles) u
  WHERE public.terminal_may_manage_target(auth.uid(), u.user_id);
$$;
REVOKE ALL ON FUNCTION public.terminal_editable_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminal_editable_user_ids() TO authenticated, service_role;