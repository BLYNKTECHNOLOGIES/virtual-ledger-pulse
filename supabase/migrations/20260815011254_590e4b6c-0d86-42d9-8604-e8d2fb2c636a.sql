DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fin_entity_balance_sheet(uuid, date) TO supabase_read_only_user';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fin_entity_line_detail(uuid, date, text) TO supabase_read_only_user';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fin_entity_integrity(uuid, date) TO supabase_read_only_user';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fin_entity_bank_position(uuid, date) TO supabase_read_only_user';
  END IF;
END $$;