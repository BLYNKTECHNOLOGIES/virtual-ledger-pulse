DROP POLICY IF EXISTS "authenticated_all_user_activity_log" ON public.user_activity_log;
DROP POLICY IF EXISTS "Users can view their own activity" ON public.user_activity_log;

CREATE POLICY "activity_log_select_self_or_admin"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_permission((SELECT auth.uid()), 'user_management_manage')
  );

CREATE POLICY "activity_log_insert_self"
  ON public.user_activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IS NULL);

GRANT SELECT, INSERT ON public.user_activity_log TO authenticated;
GRANT ALL ON public.user_activity_log TO service_role;