
-- First, let's create a backup of the existing user_roles data
CREATE TABLE IF NOT EXISTS public.user_roles_backup AS 
SELECT * FROM public.user_roles;

-- Clear the existing user_roles table
DELETE FROM public.user_roles;

-- Create users table for storing user information
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, -- For storing hashed passwords
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  email_verified BOOLEAN DEFAULT false,
  last_login TIMESTAMP WITH TIME ZONE,
  failed_login_attempts INTEGER DEFAULT 0,
  account_locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default admin user (password: admin123)
INSERT INTO public.users (username, email, password_hash, first_name, last_name, status, email_verified)
VALUES (
  'admin',
  'admin@company.com',
  crypt('admin123', gen_salt('bf')),
  'System',
  'Administrator',
  'ACTIVE',
  true
);

-- Insert sample users with different roles
INSERT INTO public.users (username, email, password_hash, first_name, last_name, status, email_verified)
VALUES 
  ('john.doe', 'john.doe@company.com', crypt('password123', gen_salt('bf')), 'John', 'Doe', 'ACTIVE', true),
  ('jane.smith', 'jane.smith@company.com', crypt('password123', gen_salt('bf')), 'Jane', 'Smith', 'ACTIVE', true),
  ('mike.johnson', 'mike.johnson@company.com', crypt('password123', gen_salt('bf')), 'Mike', 'Johnson', 'ACTIVE', true),
  ('architadamle48', 'architadamle48@gmail.com', crypt('password123', gen_salt('bf')), 'Archit', 'Adamle', 'ACTIVE', true),
  ('govindyadav', '75666govindyadav@gmail.com', crypt('password123', gen_salt('bf')), 'Govind', 'Yadav', 'ACTIVE', true),
  ('priyankathakur', 'priyankathakur3303@gmail.com', crypt('password123', gen_salt('bf')), 'Priyanka', 'Thakur', 'ACTIVE', true),
  ('saxenapriya78', 'saxenapriya7826@gmail.com', crypt('password123', gen_salt('bf')), 'Priya', 'Saxena', 'ACTIVE', true);

-- Now update the user_roles table to use UUID
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE UUID USING user_id::UUID;

-- Add foreign key constraint to reference users table
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Restore user roles with proper UUID references
DO $$
DECLARE
  admin_user_id UUID;
  architadamle48_user_id UUID;
  govindyadav_user_id UUID;
  priyankathakur_user_id UUID;
  saxenapriya78_user_id UUID;
  john_user_id UUID;
  jane_user_id UUID;
  mike_user_id UUID;
  super_admin_role_id UUID;
  admin_role_id UUID;
  user_role_id UUID;
  sales_role_id UUID;
BEGIN
  -- Get user IDs
  SELECT id INTO admin_user_id FROM public.users WHERE username = 'admin';
  SELECT id INTO architadamle48_user_id FROM public.users WHERE username = 'architadamle48';
  SELECT id INTO govindyadav_user_id FROM public.users WHERE username = 'govindyadav';
  SELECT id INTO priyankathakur_user_id FROM public.users WHERE username = 'priyankathakur';
  SELECT id INTO saxenapriya78_user_id FROM public.users WHERE username = 'saxenapriya78';
  SELECT id INTO john_user_id FROM public.users WHERE username = 'john.doe';
  SELECT id INTO jane_user_id FROM public.users WHERE username = 'jane.smith';
  SELECT id INTO mike_user_id FROM public.users WHERE username = 'mike.johnson';
  
  -- Get role IDs
  SELECT id INTO super_admin_role_id FROM public.roles WHERE name = 'Super Admin';
  SELECT id INTO admin_role_id FROM public.roles WHERE name = 'Admin';
  SELECT id INTO user_role_id FROM public.roles WHERE name = 'User';
  SELECT id INTO sales_role_id FROM public.roles WHERE name = 'Sales Manager';
  
  -- Assign roles to users
  INSERT INTO public.user_roles (user_id, role_id, assigned_by)
  VALUES 
    (admin_user_id, super_admin_role_id, 'system'),
    (architadamle48_user_id, user_role_id, 'system'),
    (govindyadav_user_id, user_role_id, 'system'),
    (priyankathakur_user_id, user_role_id, 'system'),
    (saxenapriya78_user_id, admin_role_id, 'system'),
    (john_user_id, admin_role_id, 'system'),
    (jane_user_id, sales_role_id, 'system'),
    (mike_user_id, user_role_id, 'system');
END $$;

-- Create additional tables
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  language TEXT DEFAULT 'en',
  timezone TEXT DEFAULT 'UTC',
  notifications_enabled BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE public.user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (id = auth.uid()::UUID OR EXISTS (
    SELECT 1 FROM public.user_roles ur 
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id 
    WHERE ur.user_id = auth.uid()::UUID AND rp.permission = 'manage_users'
  ));

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (id = auth.uid()::UUID);

CREATE POLICY "Admins can manage all users" ON public.users
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.user_roles ur 
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id 
    WHERE ur.user_id = auth.uid()::UUID AND rp.permission = 'manage_users'
  ));

-- Create policies for user sessions
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT USING (user_id = auth.uid()::UUID);

CREATE POLICY "Users can manage their own sessions" ON public.user_sessions
  FOR ALL USING (user_id = auth.uid()::UUID);

-- Create policies for user preferences
CREATE POLICY "Users can manage their own preferences" ON public.user_preferences
  FOR ALL USING (user_id = auth.uid()::UUID);

-- Create policies for user activity log
CREATE POLICY "Users can view their own activity" ON public.user_activity_log
  FOR SELECT USING (user_id = auth.uid()::UUID OR EXISTS (
    SELECT 1 FROM public.user_roles ur 
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id 
    WHERE ur.user_id = auth.uid()::UUID AND rp.permission = 'manage_users'
  ));

CREATE POLICY "System can insert activity logs" ON public.user_activity_log
  FOR INSERT WITH CHECK (true);

-- Create policies for password reset tokens
CREATE POLICY "Users can view their own reset tokens" ON public.password_reset_tokens
  FOR SELECT USING (user_id = auth.uid()::UUID);

CREATE POLICY "System can manage reset tokens" ON public.password_reset_tokens
  FOR ALL WITH CHECK (true);

-- Create policies for email verification tokens
CREATE POLICY "Users can view their own verification tokens" ON public.email_verification_tokens
  FOR SELECT USING (user_id = auth.uid()::UUID);

CREATE POLICY "System can manage verification tokens" ON public.email_verification_tokens
  FOR ALL WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_status ON public.users(status);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX idx_user_activity_log_user_id ON public.user_activity_log(user_id);
CREATE INDEX idx_user_activity_log_created_at ON public.user_activity_log(created_at);
CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON public.email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_user_id ON public.email_verification_tokens(user_id);

-- Create functions for user management
CREATE OR REPLACE FUNCTION public.get_user_with_roles(user_uuid UUID)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  roles JSONB
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.phone,
    u.status,
    u.created_at,
    COALESCE(
      json_agg(
        json_build_object(
          'id', r.id,
          'name', r.name,
          'description', r.description
        )
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'::json
    )::jsonb
  FROM public.users u
  LEFT JOIN public.user_roles ur ON u.id = ur.user_id
  LEFT JOIN public.roles r ON ur.role_id = r.id
  WHERE u.id = user_uuid
  GROUP BY u.id, u.username, u.email, u.first_name, u.last_name, u.phone, u.status, u.created_at;
$$;

-- Create function to validate user credentials
CREATE OR REPLACE FUNCTION public.validate_user_credentials(input_username TEXT, input_password TEXT)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT,
  is_valid BOOLEAN
)
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.status,
    (u.password_hash = crypt(input_password, u.password_hash)) as is_valid
  FROM public.users u
  WHERE u.username = input_username OR u.email = input_username;
END;
$$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON public.users 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at 
  BEFORE UPDATE ON public.user_preferences 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Clean up backup table
DROP TABLE IF EXISTS public.user_roles_backup;
