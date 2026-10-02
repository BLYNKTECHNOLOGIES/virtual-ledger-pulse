REVOKE EXECUTE ON FUNCTION public.hr_leave_working_days(uuid,date,date,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_half_day_total() FROM PUBLIC, anon, authenticated;