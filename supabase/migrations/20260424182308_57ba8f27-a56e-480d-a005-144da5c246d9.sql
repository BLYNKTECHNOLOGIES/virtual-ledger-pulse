ALTER TABLE public.terminal_payer_order_locks REPLICA IDENTITY FULL;
ALTER TABLE public.terminal_payer_order_log REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_payer_order_locks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_payer_order_log;