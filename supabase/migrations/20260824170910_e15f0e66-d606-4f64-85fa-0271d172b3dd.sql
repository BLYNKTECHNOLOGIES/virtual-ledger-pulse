-- 1) Trigger helper must not be publicly executable
REVOKE EXECUTE ON FUNCTION public.hr_notify_regularization() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_notify_regularization() FROM anon;

-- 2) password_reset_requests: no anonymous inserts
DROP POLICY IF EXISTS "anon_insert_password_reset" ON public.password_reset_requests;
REVOKE ALL ON public.password_reset_requests FROM anon;

-- 3) p2p_quick_replies: shared (user_id IS NULL) templates are team-wide,
--    managed only by terminal settings managers; personal rows stay owner-scoped.
DROP POLICY IF EXISTS "Users read own quick replies" ON public.p2p_quick_replies;
DROP POLICY IF EXISTS "Users insert own quick replies" ON public.p2p_quick_replies;
DROP POLICY IF EXISTS "Users update own quick replies" ON public.p2p_quick_replies;
DROP POLICY IF EXISTS "Users delete own quick replies" ON public.p2p_quick_replies;

CREATE POLICY "quick_replies_select" ON public.p2p_quick_replies
FOR SELECT TO authenticated
USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "quick_replies_insert" ON public.p2p_quick_replies
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (user_id IS NULL AND public.has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
);

CREATE POLICY "quick_replies_update" ON public.p2p_quick_replies
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR (user_id IS NULL AND public.has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
)
WITH CHECK (
  user_id = auth.uid()
  OR (user_id IS NULL AND public.has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
);

CREATE POLICY "quick_replies_delete" ON public.p2p_quick_replies
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR (user_id IS NULL AND public.has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
);
