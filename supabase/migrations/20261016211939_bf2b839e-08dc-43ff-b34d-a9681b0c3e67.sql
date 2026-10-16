
REVOKE EXECUTE ON FUNCTION public.ats_job_requirements_check() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ats_job_requirements_after_write() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ats_job_requirement_ids(uuid) FROM public, anon, authenticated;
