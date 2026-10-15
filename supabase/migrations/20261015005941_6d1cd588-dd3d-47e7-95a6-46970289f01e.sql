REVOKE ALL ON FUNCTION public.cbt_live_readiness(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cbt_live_new_problems(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_live_readiness(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cbt_live_new_problems(jsonb,jsonb) TO service_role;