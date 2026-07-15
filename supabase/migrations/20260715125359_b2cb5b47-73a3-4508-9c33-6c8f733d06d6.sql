INSERT INTO public.role_permissions (role_id, permission)
SELECT id, 'hrms_razorpay_sync'::app_permission FROM public.roles WHERE name = 'Super Admin'
ON CONFLICT DO NOTHING;