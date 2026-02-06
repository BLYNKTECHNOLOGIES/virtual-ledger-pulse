
-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Re-grant to ensure visibility
GRANT EXECUTE ON FUNCTION public.delete_contra_entry(UUID) TO anon, authenticated, service_role;
