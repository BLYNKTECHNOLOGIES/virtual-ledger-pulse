
-- Drop all policies that depend on the permission column
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can view their own activity" ON public.user_activity_log;
DROP POLICY IF EXISTS "System can insert activity logs" ON public.user_activity_log;
DROP POLICY IF EXISTS "Users can view their own reset tokens" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "System can manage reset tokens" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Users can view their own verification tokens" ON public.email_verification_tokens;
DROP POLICY IF EXISTS "System can manage verification tokens" ON public.email_verification_tokens;

-- Drop existing policy on pending_registrations if it exists
DROP POLICY IF EXISTS "Allow all operations on pending_registrations" ON public.pending_registrations;

-- Create pending registrations table for new user approvals
CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES public.users(id),
  rejection_reason TEXT
);

-- Create permissions enum type for granular access control with all required permissions
DO $$ BEGIN
  CREATE TYPE app_permission AS ENUM (
    'manage_users',
    'manage_roles',
    'view_dashboard',
    'manage_sales',
    'view_sales',
    'manage_purchase',
    'view_purchase',
    'manage_stock',
    'view_stock',
    'manage_inventory',
    'view_inventory',
    'manage_clients',
    'view_clients',
    'manage_leads',
    'view_leads',
    'manage_hrms',
    'view_hrms',
    'manage_payroll',
    'view_payroll',
    'manage_accounting',
    'view_accounting',
    'manage_banking',
    'view_banking',
    'manage_compliance',
    'view_compliance',
    'admin_access',
    'super_admin_access'
  );
EXCEPTION
  WHEN duplicate_object THEN 
    -- If enum exists, add any missing values
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_users';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_roles';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_dashboard';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_sales';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_sales';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_purchase';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_purchase';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_stock';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_stock';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_inventory';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_inventory';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_clients';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_clients';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_leads';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_leads';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_hrms';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_hrms';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_payroll';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_payroll';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_accounting';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_accounting';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_banking';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_banking';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'manage_compliance';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_compliance';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'admin_access';
    ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'super_admin_access';
END $$;

-- Update role_permissions table to use the enum
DO $$ 
BEGIN
  ALTER TABLE public.role_permissions 
    ALTER COLUMN permission TYPE app_permission USING permission::app_permission;
EXCEPTION
  WHEN invalid_text_representation THEN
    -- Handle case where existing values don't match enum
    -- First, let's see what values exist and map them appropriately
    UPDATE public.role_permissions SET permission = 'manage_stock'::text WHERE permission = 'view_stock';
    UPDATE public.role_permissions SET permission = 'manage_inventory'::text WHERE permission = 'view_inventory';
    -- Then try the conversion again
    ALTER TABLE public.role_permissions 
      ALTER COLUMN permission TYPE app_permission USING permission::app_permission;
  WHEN OTHERS THEN
    -- Column might already be the correct type
    NULL;
END $$;

-- Recreate all the policies with proper permission checking
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (
    id = auth.uid()::UUID OR 
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id 
      WHERE ur.user_id = auth.uid()::UUID AND rp.permission = 'manage_users'::app_permission
    )
  );

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (id = auth.uid()::UUID);

CREATE POLICY "Admins can manage all users" ON public.users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id 
      WHERE ur.user_id = auth.uid()::UUID AND rp.permission = 'manage_users'::app_permission
    )
  );

CREATE POLICY "Users can view their own activity" ON public.user_activity_log
  FOR SELECT USING (
    user_id = auth.uid()::UUID OR 
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id 
      WHERE ur.user_id = auth.uid()::UUID AND rp.permission = 'manage_users'::app_permission
    )
  );

CREATE POLICY "System can insert activity logs" ON public.user_activity_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view their own reset tokens" ON public.password_reset_tokens
  FOR SELECT USING (user_id = auth.uid()::UUID);

CREATE POLICY "System can manage reset tokens" ON public.password_reset_tokens
  FOR ALL WITH CHECK (true);

CREATE POLICY "Users can view their own verification tokens" ON public.email_verification_tokens
  FOR SELECT USING (user_id = auth.uid()::UUID);

CREATE POLICY "System can manage verification tokens" ON public.email_verification_tokens
  FOR ALL WITH CHECK (true);

-- Enable RLS on pending registrations
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- Create policies for pending registrations
CREATE POLICY "Allow all operations on pending_registrations" 
  ON public.pending_registrations 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Create functions for registration approval workflow
CREATE OR REPLACE FUNCTION public.approve_registration(registration_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reg_record RECORD;
BEGIN
  -- Get the pending registration
  SELECT * INTO reg_record FROM public.pending_registrations 
  WHERE id = registration_id AND status = 'PENDING';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into users table
  INSERT INTO public.users (
    username, email, first_name, last_name, phone, password_hash, status
  ) VALUES (
    reg_record.username, 
    reg_record.email, 
    reg_record.first_name, 
    reg_record.last_name, 
    reg_record.phone, 
    reg_record.password_hash, 
    'ACTIVE'
  );
  
  -- Update pending registration status
  UPDATE public.pending_registrations 
  SET status = 'APPROVED', reviewed_at = now()
  WHERE id = registration_id;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_registration(registration_id UUID, reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.pending_registrations 
  SET status = 'REJECTED', reviewed_at = now(), rejection_reason = reason
  WHERE id = registration_id AND status = 'PENDING';
  
  RETURN FOUND;
END;
$$;

-- Update get_user_permissions function to work with UUID user_id
CREATE OR REPLACE FUNCTION public.get_user_permissions(user_uuid UUID)
RETURNS TABLE(permission app_permission)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT rp.permission
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role_id = rp.role_id
  WHERE ur.user_id = user_uuid;
$$;

-- Create function to check if user has specific permission
CREATE OR REPLACE FUNCTION public.user_has_permission(user_uuid UUID, check_permission app_permission)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = user_uuid AND rp.permission = check_permission
  );
$$;

-- Insert default permissions into existing roles if they don't exist (only safe permissions)
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'manage_users'::app_permission
FROM public.roles r
WHERE r.name = 'Super Admin' 
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp 
  WHERE rp.role_id = r.id AND rp.permission = 'manage_users'::app_permission
);

INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'view_dashboard'::app_permission
FROM public.roles r
WHERE r.name = 'User' 
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp 
  WHERE rp.role_id = r.id AND rp.permission = 'view_dashboard'::app_permission
);
