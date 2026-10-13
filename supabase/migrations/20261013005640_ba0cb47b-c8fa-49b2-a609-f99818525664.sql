REVOKE EXECUTE ON FUNCTION public.ats_can_manage_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_can_manage_settings() TO authenticated;