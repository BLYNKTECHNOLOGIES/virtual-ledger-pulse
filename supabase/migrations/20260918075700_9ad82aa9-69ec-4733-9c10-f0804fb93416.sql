INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT DISTINCT p.role_id, 'terminal_ad_uptime_view'::terminal_permission
FROM public.p2p_terminal_role_permissions p
WHERE p.permission::text = 'terminal_mpi_view_all'
  AND NOT EXISTS (
    SELECT 1 FROM public.p2p_terminal_role_permissions x
    WHERE x.role_id = p.role_id AND x.permission::text = 'terminal_ad_uptime_view'
  );