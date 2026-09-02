REVOKE EXECUTE ON FUNCTION public.hr_employment_gap_working_days(uuid[], date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_employment_gap_working_days(uuid[], date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_employment_gap_working_days(uuid[], date) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.hr_lop_days_window(uuid[], date, date, date) TO supabase_read_only_user;