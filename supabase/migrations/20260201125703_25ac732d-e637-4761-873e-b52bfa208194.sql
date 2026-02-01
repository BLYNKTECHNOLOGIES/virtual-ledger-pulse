-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Ensure role_functions table has proper policies (recreate if needed)
DROP POLICY IF EXISTS "Allow all operations on role_functions" ON role_functions;
CREATE POLICY "Allow all operations on role_functions" 
ON role_functions 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Ensure system_functions table has proper policies for reading
DROP POLICY IF EXISTS "Allow reading system functions" ON system_functions;
CREATE POLICY "Allow reading system functions" 
ON system_functions 
FOR SELECT 
USING (true);

-- Also add insert/update/delete policies for admin operations on system_functions
CREATE POLICY "Allow all write operations on system_functions" 
ON system_functions 
FOR ALL 
USING (true) 
WITH CHECK (true);