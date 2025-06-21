
-- First, let's check and update the RLS policies for the users table
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated users to view all users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to create users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to update users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to delete users" ON public.users;

-- Create comprehensive RLS policies for users table
-- Policy to allow authenticated users to view users (for admin purposes)
CREATE POLICY "Allow authenticated users to view users" 
ON public.users 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy to allow authenticated users to insert new users (for admin purposes)
CREATE POLICY "Allow authenticated users to insert users" 
ON public.users 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Policy to allow authenticated users to update users (for admin purposes)
CREATE POLICY "Allow authenticated users to update users" 
ON public.users 
FOR UPDATE 
TO authenticated 
USING (true);

-- Policy to allow authenticated users to delete users (for admin purposes)
CREATE POLICY "Allow authenticated users to delete users" 
ON public.users 
FOR DELETE 
TO authenticated 
USING (true);

-- Also ensure the users table has RLS enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create a more specific policy for user creation based on roles (optional enhancement)
-- This policy allows users with admin role to create other users
CREATE POLICY "Admin users can create users" 
ON public.users 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid() AND r.name = 'Admin'
  )
);

-- Drop the general insert policy and keep only the admin-specific one
DROP POLICY "Allow authenticated users to insert users" ON public.users;
