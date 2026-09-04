REVOKE EXECUTE ON FUNCTION public.hr_settle_compoff_credits(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_settle_compoff_credits(date, jsonb) TO service_role;