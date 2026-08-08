-- HR MAILBOXES
CREATE TABLE public.hr_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  from_address text NOT NULL UNIQUE,
  from_name text,
  smtp_host_secret text NOT NULL DEFAULT 'HR_SMTP_HOST',
  smtp_user_secret text NOT NULL DEFAULT 'HR_SMTP_USER',
  smtp_pass_secret text NOT NULL DEFAULT 'HR_SMTP_PASS',
  imap_host text,
  imap_port integer NOT NULL DEFAULT 993,
  imap_user_secret text,
  imap_pass_secret text,
  imap_enabled boolean NOT NULL DEFAULT false,
  imap_last_uid bigint NOT NULL DEFAULT 0,
  imap_last_sync_at timestamptz,
  imap_last_error text,
  cc_addresses text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_mailboxes TO authenticated;
GRANT ALL ON public.hr_mailboxes TO service_role;
ALTER TABLE public.hr_mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated staff manage hr mailboxes" ON public.hr_mailboxes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- TEMPLATES
CREATE TABLE public.hr_mail_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_mail_templates TO authenticated;
GRANT ALL ON public.hr_mail_templates TO service_role;
ALTER TABLE public.hr_mail_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated staff manage hr mail templates" ON public.hr_mail_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CAMPAIGNS
CREATE TABLE public.hr_mail_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid REFERENCES public.hr_mailboxes(id) ON DELETE SET NULL,
  from_address text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  recipient_mode text NOT NULL DEFAULT 'selected',
  attachment_paths text[] NOT NULL DEFAULT '{}',
  in_reply_to_message_id uuid,
  total_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  sent_by uuid,
  sent_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_mail_campaigns TO authenticated;
GRANT ALL ON public.hr_mail_campaigns TO service_role;
ALTER TABLE public.hr_mail_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated staff manage hr mail campaigns" ON public.hr_mail_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CAMPAIGN RECIPIENTS
CREATE TABLE public.hr_mail_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.hr_mail_campaigns(id) ON DELETE CASCADE,
  employee_id uuid,
  employee_name text,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);
CREATE INDEX idx_hr_mail_campaign_recipients_campaign ON public.hr_mail_campaign_recipients(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_mail_campaign_recipients TO authenticated;
GRANT ALL ON public.hr_mail_campaign_recipients TO service_role;
ALTER TABLE public.hr_mail_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated staff manage hr mail recipients" ON public.hr_mail_campaign_recipients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INBOX MESSAGES
CREATE TABLE public.hr_mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.hr_mailboxes(id) ON DELETE CASCADE,
  imap_uid bigint NOT NULL,
  message_id_header text,
  from_address text,
  from_name text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  subject text,
  snippet text,
  body_html text,
  body_text text,
  received_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  matched_employee_id uuid,
  has_attachments boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, imap_uid)
);
CREATE INDEX idx_hr_mail_messages_received ON public.hr_mail_messages(mailbox_id, received_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_mail_messages TO authenticated;
GRANT ALL ON public.hr_mail_messages TO service_role;
ALTER TABLE public.hr_mail_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated staff manage hr mail messages" ON public.hr_mail_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ATTACHMENTS
CREATE TABLE public.hr_mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.hr_mail_messages(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.hr_mail_campaigns(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_mail_attachments TO authenticated;
GRANT ALL ON public.hr_mail_attachments TO service_role;
ALTER TABLE public.hr_mail_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated staff manage hr mail attachments" ON public.hr_mail_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at triggers
CREATE TRIGGER trg_hr_mailboxes_updated BEFORE UPDATE ON public.hr_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_mail_templates_updated BEFORE UPDATE ON public.hr_mail_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_mail_campaigns_updated BEFORE UPDATE ON public.hr_mail_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_mail_campaign_recipients_updated BEFORE UPDATE ON public.hr_mail_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_mail_messages_updated BEFORE UPDATE ON public.hr_mail_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the existing HR sender mailbox
INSERT INTO public.hr_mailboxes (label, from_address, from_name)
VALUES ('HR Desk', 'hr.desk@blynkex.com', 'HR - Blynk Virtual Technologies')
ON CONFLICT (from_address) DO NOTHING;