REVOKE ALL ON FUNCTION public.hr_tg_fnf_close_instalments() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_close_leaver_instalments(uuid,text) FROM authenticated;