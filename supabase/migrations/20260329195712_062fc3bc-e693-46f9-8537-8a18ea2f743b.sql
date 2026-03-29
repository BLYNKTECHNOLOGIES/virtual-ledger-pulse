
-- Grant both shift_reconciliation permissions to Super Admin and Admin roles
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.perm
FROM public.roles r
CROSS JOIN (VALUES ('shift_reconciliation_create'::app_permission), ('shift_reconciliation_approve'::app_permission)) AS p(perm)
WHERE r.name IN ('Super Admin', 'Admin', 'COO')
ON CONFLICT (role_id, permission) DO NOTHING;

-- Grant only create to operation role
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'shift_reconciliation_create'::app_permission
FROM public.roles r
WHERE r.name = 'operation'
ON CONFLICT (role_id, permission) DO NOTHING;
