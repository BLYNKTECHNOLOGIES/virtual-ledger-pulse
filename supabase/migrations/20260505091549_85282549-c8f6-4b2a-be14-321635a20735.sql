INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p::app_permission
FROM public.roles r
CROSS JOIN (VALUES ('help_assistant_view'), ('help_assistant_manage')) AS t(p)
WHERE r.name IN ('Super Admin','Admin')
ON CONFLICT DO NOTHING;