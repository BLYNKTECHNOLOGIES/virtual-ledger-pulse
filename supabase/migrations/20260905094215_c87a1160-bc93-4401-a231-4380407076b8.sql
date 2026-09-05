ALTER TABLE public.hr_fnf_settlements REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_fnf_settlements;