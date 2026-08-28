-- 1. Remove anonymous execute rights on trigger-only SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.hr_notify_bank_change_request() FROM anon, public;
ALTER FUNCTION public.hr_notify_bank_change_request() SET search_path = public;

-- 2. Replace the non-existent 'hr' role check with hr_is_hr_staff()
DROP POLICY IF EXISTS "Admin/HR can view email logs" ON public.hr_email_send_log;
CREATE POLICY "Admin/HR can view email logs"
ON public.hr_email_send_log FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super admin')
  OR has_role((SELECT auth.uid()), 'admin')
  OR public.hr_is_hr_staff((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admin/HR can view salary revisions" ON public.hr_salary_revisions;
CREATE POLICY "Admin/HR can view salary revisions"
ON public.hr_salary_revisions FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super admin')
  OR has_role((SELECT auth.uid()), 'admin')
  OR public.hr_is_hr_staff((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admin can insert salary revisions" ON public.hr_salary_revisions;
CREATE POLICY "Admin can insert salary revisions"
ON public.hr_salary_revisions FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'super admin')
  OR has_role((SELECT auth.uid()), 'admin')
  OR public.hr_is_hr_staff((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admin/HR can view fnf settlements" ON public.hr_fnf_settlements;
CREATE POLICY "Admin/HR can view fnf settlements"
ON public.hr_fnf_settlements FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super admin')
  OR has_role((SELECT auth.uid()), 'admin')
  OR public.hr_is_hr_staff((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admin/HR can insert fnf settlements" ON public.hr_fnf_settlements;
CREATE POLICY "Admin/HR can insert fnf settlements"
ON public.hr_fnf_settlements FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'super admin')
  OR has_role((SELECT auth.uid()), 'admin')
  OR public.hr_is_hr_staff((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admin/HR can update fnf settlements" ON public.hr_fnf_settlements;
CREATE POLICY "Admin/HR can update fnf settlements"
ON public.hr_fnf_settlements FOR UPDATE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super admin')
  OR has_role((SELECT auth.uid()), 'admin')
  OR public.hr_is_hr_staff((SELECT auth.uid()))
);

-- 3. Terminal quick replies: require terminal access in addition to ownership
DROP POLICY IF EXISTS "quick_replies_insert" ON public.p2p_quick_replies;
CREATE POLICY "quick_replies_insert"
ON public.p2p_quick_replies FOR INSERT TO authenticated
WITH CHECK (
  public.verify_terminal_access(auth.uid())
  AND (
    user_id = auth.uid()
    OR (user_id IS NULL AND has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
  )
);

DROP POLICY IF EXISTS "quick_replies_update" ON public.p2p_quick_replies;
CREATE POLICY "quick_replies_update"
ON public.p2p_quick_replies FOR UPDATE TO authenticated
USING (
  public.verify_terminal_access(auth.uid())
  AND (
    user_id = auth.uid()
    OR (user_id IS NULL AND has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
  )
)
WITH CHECK (
  public.verify_terminal_access(auth.uid())
  AND (
    user_id = auth.uid()
    OR (user_id IS NULL AND has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
  )
);

DROP POLICY IF EXISTS "quick_replies_delete" ON public.p2p_quick_replies;
CREATE POLICY "quick_replies_delete"
ON public.p2p_quick_replies FOR DELETE TO authenticated
USING (
  public.verify_terminal_access(auth.uid())
  AND (
    user_id = auth.uid()
    OR (user_id IS NULL AND has_terminal_permission(auth.uid(), 'terminal_settings_manage'::terminal_permission))
  )
);

DROP POLICY IF EXISTS "quick_replies_select" ON public.p2p_quick_replies;
CREATE POLICY "quick_replies_select"
ON public.p2p_quick_replies FOR SELECT TO authenticated
USING (
  public.verify_terminal_access(auth.uid())
  AND (user_id IS NULL OR user_id = auth.uid())
);

-- Prevent future functions being auto-granted to anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;