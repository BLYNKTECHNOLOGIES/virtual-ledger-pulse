REVOKE EXECUTE ON FUNCTION public.hr_tg_classify_ctc_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_tg_cockpit_close_push_ctc() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_ctc_push_held(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_ctc_revisions_due_for_push(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_revision_push_window(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_revision_push_window(uuid) TO authenticated, service_role;