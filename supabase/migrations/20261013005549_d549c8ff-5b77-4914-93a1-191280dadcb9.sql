DROP POLICY IF EXISTS "HR staff manage hr mailboxes" ON public.hr_mailboxes;
CREATE POLICY "HR staff read hr mailboxes" ON public.hr_mailboxes
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR admins insert hr mailboxes" ON public.hr_mailboxes
  FOR INSERT TO authenticated WITH CHECK (public.hr_is_hr_admin());
CREATE POLICY "HR admins update hr mailboxes" ON public.hr_mailboxes
  FOR UPDATE TO authenticated USING (public.hr_is_hr_admin()) WITH CHECK (public.hr_is_hr_admin());
CREATE POLICY "HR admins delete hr mailboxes" ON public.hr_mailboxes
  FOR DELETE TO authenticated USING (public.hr_is_hr_admin());

ALTER TABLE public.hr_mailboxes
  ADD CONSTRAINT hr_mailboxes_secret_names CHECK (
    (smtp_host_secret IS NULL OR smtp_host_secret ~ '^HR_[A-Z0-9_]{1,40}$') AND
    (smtp_user_secret IS NULL OR smtp_user_secret ~ '^HR_[A-Z0-9_]{1,40}$') AND
    (smtp_pass_secret IS NULL OR smtp_pass_secret ~ '^HR_[A-Z0-9_]{1,40}$') AND
    (imap_user_secret IS NULL OR imap_user_secret ~ '^HR_[A-Z0-9_]{1,40}$') AND
    (imap_pass_secret IS NULL OR imap_pass_secret ~ '^HR_[A-Z0-9_]{1,40}$')),
  ADD CONSTRAINT hr_mailboxes_imap_host_allowed CHECK (imap_host IS NULL OR imap_host = 'imap.gmail.com'),
  ADD CONSTRAINT hr_mailboxes_imap_port_allowed CHECK (imap_port IS NULL OR imap_port = 993);

CREATE OR REPLACE FUNCTION public.hr_mailboxes_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF v_role IN ('authenticated', 'anon') AND (
       TG_OP = 'INSERT'
       OR NEW.smtp_host_secret IS DISTINCT FROM OLD.smtp_host_secret
       OR NEW.smtp_user_secret IS DISTINCT FROM OLD.smtp_user_secret
       OR NEW.smtp_pass_secret IS DISTINCT FROM OLD.smtp_pass_secret
       OR NEW.imap_user_secret IS DISTINCT FROM OLD.imap_user_secret
       OR NEW.imap_pass_secret IS DISTINCT FROM OLD.imap_pass_secret
       OR NEW.imap_host IS DISTINCT FROM OLD.imap_host
       OR NEW.imap_port IS DISTINCT FROM OLD.imap_port) THEN
    RAISE EXCEPTION 'HR_MAILBOX_LOCKED'
      USING HINT = 'Mail server and sign-in settings can only be changed by a developer.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_mailboxes_guard ON public.hr_mailboxes;
CREATE TRIGGER hr_mailboxes_guard BEFORE INSERT OR UPDATE ON public.hr_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.hr_mailboxes_guard();

CREATE OR REPLACE FUNCTION public.ats_can_manage_settings()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.hr_is_hr_admin()
      OR public.has_permission(auth.uid(), 'hrms_manage'::app_permission)
      OR public.has_permission(auth.uid(), 'manage_hrms'::app_permission)
$$;
GRANT EXECUTE ON FUNCTION public.ats_can_manage_settings() TO authenticated;

DROP POLICY ats_settings_update ON public.ats_settings;
CREATE POLICY ats_settings_update ON public.ats_settings FOR UPDATE TO authenticated
  USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));

DROP POLICY ats_email_templates_insert ON public.ats_email_templates;
CREATE POLICY ats_email_templates_insert ON public.ats_email_templates FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.ats_can_manage_settings()));
DROP POLICY ats_email_templates_update ON public.ats_email_templates;
CREATE POLICY ats_email_templates_update ON public.ats_email_templates FOR UPDATE TO authenticated
  USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));
DROP POLICY ats_email_templates_delete ON public.ats_email_templates;
CREATE POLICY ats_email_templates_delete ON public.ats_email_templates FOR DELETE TO authenticated
  USING ((SELECT public.ats_can_manage_settings()) AND (NOT is_system));

DROP POLICY ats_stages_insert ON public.ats_stages;
CREATE POLICY ats_stages_insert ON public.ats_stages FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.ats_can_manage_settings()));
DROP POLICY ats_stages_update ON public.ats_stages;
CREATE POLICY ats_stages_update ON public.ats_stages FOR UPDATE TO authenticated
  USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));
DROP POLICY ats_stages_delete ON public.ats_stages;
CREATE POLICY ats_stages_delete ON public.ats_stages FOR DELETE TO authenticated
  USING ((SELECT public.ats_can_manage_settings()) AND (NOT is_system));

DROP POLICY ats_sources_insert ON public.ats_sources;
CREATE POLICY ats_sources_insert ON public.ats_sources FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.ats_can_manage_settings()));
DROP POLICY ats_sources_update ON public.ats_sources;
CREATE POLICY ats_sources_update ON public.ats_sources FOR UPDATE TO authenticated
  USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));

DROP POLICY ats_reject_reasons_insert ON public.ats_reject_reasons;
CREATE POLICY ats_reject_reasons_insert ON public.ats_reject_reasons FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.ats_can_manage_settings()));
DROP POLICY ats_reject_reasons_update ON public.ats_reject_reasons;
CREATE POLICY ats_reject_reasons_update ON public.ats_reject_reasons FOR UPDATE TO authenticated
  USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));