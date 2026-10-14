REVOKE EXECUTE ON FUNCTION public.cbt_blueprint_readiness(text, text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_save_role_blueprint(uuid, uuid, text, numeric, numeric, boolean, jsonb, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_try_test(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_try_runs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_blueprint_readiness(text, text, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_save_role_blueprint(uuid, uuid, text, numeric, numeric, boolean, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_try_test(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_try_runs(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_purge_try_runs() TO service_role;