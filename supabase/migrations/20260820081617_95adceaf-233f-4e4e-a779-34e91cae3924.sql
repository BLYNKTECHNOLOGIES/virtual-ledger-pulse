DROP POLICY IF EXISTS "Authenticated staff manage hr mail messages" ON public.hr_mail_messages;
DROP POLICY IF EXISTS "Authenticated staff manage hr mailboxes" ON public.hr_mailboxes;
DROP POLICY IF EXISTS "Authenticated staff manage hr mail campaigns" ON public.hr_mail_campaigns;
DROP POLICY IF EXISTS "Authenticated staff manage hr mail recipients" ON public.hr_mail_campaign_recipients;
DROP POLICY IF EXISTS "Authenticated staff manage hr mail attachments" ON public.hr_mail_attachments;
DROP POLICY IF EXISTS "Authenticated staff manage hr mail templates" ON public.hr_mail_templates;

CREATE POLICY "HR staff manage hr mail messages" ON public.hr_mail_messages FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage hr mailboxes" ON public.hr_mailboxes FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage hr mail campaigns" ON public.hr_mail_campaigns FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage hr mail recipients" ON public.hr_mail_campaign_recipients FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage hr mail attachments" ON public.hr_mail_attachments FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage hr mail templates" ON public.hr_mail_templates FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));