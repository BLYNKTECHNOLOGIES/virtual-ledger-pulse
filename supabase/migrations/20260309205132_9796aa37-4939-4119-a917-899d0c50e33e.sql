
-- Force GRANTs - these must exist for any RLS-protected table
DO $$
BEGIN
  -- terminal_user_presence
  EXECUTE 'GRANT SELECT ON public.terminal_user_presence TO authenticated';
  EXECUTE 'GRANT INSERT ON public.terminal_user_presence TO authenticated';
  EXECUTE 'GRANT UPDATE ON public.terminal_user_presence TO authenticated';
  EXECUTE 'GRANT SELECT ON public.terminal_user_presence TO anon';
  
  -- terminal_notifications
  EXECUTE 'GRANT SELECT ON public.terminal_notifications TO authenticated';
  EXECUTE 'GRANT INSERT ON public.terminal_notifications TO authenticated';
  EXECUTE 'GRANT UPDATE ON public.terminal_notifications TO authenticated';
  EXECUTE 'GRANT DELETE ON public.terminal_notifications TO authenticated';
  
  -- service_role
  EXECUTE 'GRANT ALL ON public.terminal_user_presence TO service_role';
  EXECUTE 'GRANT ALL ON public.terminal_notifications TO service_role';
END $$;
