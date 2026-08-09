ALTER TABLE public.hr_mail_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_mail_messages;