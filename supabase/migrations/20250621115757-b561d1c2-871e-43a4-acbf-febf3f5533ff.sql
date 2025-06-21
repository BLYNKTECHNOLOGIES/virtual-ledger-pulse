
-- First, let's ensure we have the proper RLS policies for the users table
-- Enable RLS if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to view all users (for admin purposes)
CREATE POLICY "Allow authenticated users to view all users" 
ON public.users 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy to allow authenticated users to insert new users (for admin purposes)
CREATE POLICY "Allow authenticated users to create users" 
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
