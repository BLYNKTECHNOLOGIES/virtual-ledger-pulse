
-- Create an enum for application permissions
CREATE TYPE public.app_permission AS ENUM (
  'view_dashboard',
  'view_sales',
  'view_purchase', 
  'view_bams',
  'view_clients',
  'view_leads',
  'view_user_management',
  'view_hrms',
  'view_payroll',
  'view_compliance',
  'view_stock_management',
  'view_accounting',
  'manage_users',
  'manage_roles'
);

-- Create roles table
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system_role BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create role permissions table
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission app_permission NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(role_id, permission)
);

-- Create user roles table (users can have multiple roles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- References the username from your auth system
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  assigned_by TEXT,
  UNIQUE(user_id, role_id)
);

-- Enable RLS on all tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing all operations for now - you can restrict later)
CREATE POLICY "Allow all operations on roles" ON public.roles FOR ALL USING (true);
CREATE POLICY "Allow all operations on role_permissions" ON public.role_permissions FOR ALL USING (true);
CREATE POLICY "Allow all operations on user_roles" ON public.user_roles FOR ALL USING (true);

-- Insert default system roles
INSERT INTO public.roles (name, description, is_system_role) VALUES
('Super Admin', 'Full system access with all permissions', true),
('Admin', 'Administrative access to most features', true),
('User', 'Basic user access to core features', true),
('Sales Manager', 'Access to sales and client management', false),
('HR Manager', 'Access to HR and payroll features', false);

-- Insert permissions for Super Admin (all permissions)
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission::app_permission
FROM public.roles r
CROSS JOIN (
  SELECT unnest(enum_range(NULL::app_permission)) as permission
) p
WHERE r.name = 'Super Admin';

-- Insert permissions for Admin role
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission::app_permission
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('view_dashboard'),
    ('view_sales'),
    ('view_purchase'),
    ('view_bams'),
    ('view_clients'),
    ('view_leads'),
    ('view_user_management'),
    ('view_hrms'),
    ('view_payroll'),
    ('view_compliance'),
    ('view_stock_management'),
    ('view_accounting'),
    ('manage_users')
) p(permission)
WHERE r.name = 'Admin';

-- Insert permissions for User role
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission::app_permission
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('view_dashboard'),
    ('view_sales'),
    ('view_purchase'),
    ('view_clients'),
    ('view_leads'),
    ('view_stock_management')
) p(permission)
WHERE r.name = 'User';

-- Insert permissions for Sales Manager
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission::app_permission
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('view_dashboard'),
    ('view_sales'),
    ('view_clients'),
    ('view_leads'),
    ('view_stock_management')
) p(permission)
WHERE r.name = 'Sales Manager';

-- Insert permissions for HR Manager
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission::app_permission
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('view_dashboard'),
    ('view_hrms'),
    ('view_payroll'),
    ('view_compliance')
) p(permission)
WHERE r.name = 'HR Manager';

-- Function to get user permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(username TEXT)
RETURNS TABLE(permission app_permission)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT rp.permission
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role_id = rp.role_id
  WHERE ur.user_id = username;
$$;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION public.user_has_permission(username TEXT, check_permission app_permission)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = username AND rp.permission = check_permission
  );
$$;
