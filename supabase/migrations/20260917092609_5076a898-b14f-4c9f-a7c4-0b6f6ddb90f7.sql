GRANT INSERT, UPDATE, DELETE ON public.cbt_drives TO authenticated;
CREATE POLICY cbt_drives_manage ON public.cbt_drives FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT INSERT, UPDATE, DELETE ON public.cbt_job_roles TO authenticated;
CREATE POLICY cbt_job_roles_manage ON public.cbt_job_roles FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT INSERT, UPDATE, DELETE ON public.cbt_role_sections TO authenticated;
CREATE POLICY cbt_role_sections_manage ON public.cbt_role_sections FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT INSERT, UPDATE, DELETE ON public.cbt_stimuli TO authenticated;
CREATE POLICY cbt_stimuli_manage ON public.cbt_stimuli FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT INSERT, UPDATE, DELETE ON public.cbt_questions TO authenticated;
CREATE POLICY cbt_questions_manage ON public.cbt_questions FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT INSERT, UPDATE, DELETE ON public.cbt_question_versions TO authenticated;
CREATE POLICY cbt_question_versions_manage ON public.cbt_question_versions FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT INSERT, UPDATE, DELETE ON public.cbt_question_keys TO authenticated;
CREATE POLICY cbt_question_keys_manage ON public.cbt_question_keys FOR ALL TO authenticated USING (public.cbt_can_manage()) WITH CHECK (public.cbt_can_manage());

GRANT UPDATE ON public.cbt_settings TO authenticated;
CREATE POLICY cbt_settings_admin_update ON public.cbt_settings FOR UPDATE TO authenticated USING (public.cbt_can_admin()) WITH CHECK (public.cbt_can_admin());