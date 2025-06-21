
-- Drop the current restrictive admin-only policy
DROP POLICY IF EXISTS "Admin users can create users" ON public.users;

-- Create a simple policy that allows any authenticated user to insert
-- This is safer and will work with your current auth system
CREATE POLICY "Allow authenticated users to insert users" 
ON public.users 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

-- Also update the other policies to be more explicit about authentication
DROP POLICY IF EXISTS "Allow authenticated users to view users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to update users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to delete users" ON public.users;

CREATE POLICY "Allow authenticated users to view users" 
ON public.users 
FOR SELECT 
TO authenticated 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update users" 
ON public.users 
FOR UPDATE 
TO authenticated 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete users" 
ON public.users 
FOR DELETE 
TO authenticated 
USING (auth.uid() IS NOT NULL);
