REVOKE EXECUTE ON FUNCTION public.trg_hr_daily_mirror_legacy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_hr_legacy_follow_calendar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_mirror_calendar_day(uuid, date) FROM PUBLIC, anon, authenticated;