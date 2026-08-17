INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'compliance_approve'::app_permission
FROM public.roles r
WHERE r.name IN ('Super Admin','Admin')
ON CONFLICT DO NOTHING;