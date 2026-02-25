
-- Create password_reset_requests table
CREATE TABLE public.password_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id),
  resolver_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for quick lookups
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests(status);
CREATE INDEX idx_password_reset_requests_user_id ON public.password_reset_requests(user_id);

-- Create Super Admin role if it doesn't exist
INSERT INTO public.roles (name, description)
SELECT 'Super Admin', 'Super Administrator with highest-level access. Can manage all users, roles, and password resets.'
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Super Admin');

-- Add super_admin_access permission to Super Admin role
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'super_admin_access'::app_permission
FROM public.roles r
WHERE r.name = 'Super Admin'
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission = 'super_admin_access'
);
