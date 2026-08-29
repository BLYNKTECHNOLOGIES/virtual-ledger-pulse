ALTER TABLE public.hr_mail_messages
  ADD COLUMN IF NOT EXISTS cc_addresses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hr_mail_campaigns
  ADD COLUMN IF NOT EXISTS cc_addresses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS in_reply_to_header text,
  ADD COLUMN IF NOT EXISTS references_header text;