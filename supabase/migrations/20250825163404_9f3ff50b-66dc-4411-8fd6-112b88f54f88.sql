-- Check if RLS is enabled on investigation_updates table and enable if not
ALTER TABLE investigation_updates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for investigation_updates table to allow viewing uploaded files
CREATE POLICY "Allow reading investigation updates" 
ON investigation_updates 
FOR SELECT 
USING (true);

CREATE POLICY "Allow creating investigation updates" 
ON investigation_updates 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow updating investigation updates" 
ON investigation_updates 
FOR UPDATE 
USING (true);

-- Check if RLS is enabled on investigation_steps table and enable if not
ALTER TABLE investigation_steps ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for investigation_steps table
CREATE POLICY "Allow reading investigation steps" 
ON investigation_steps 
FOR SELECT 
USING (true);

CREATE POLICY "Allow updating investigation steps" 
ON investigation_steps 
FOR UPDATE 
USING (true);

-- Check if RLS is enabled on account_investigations table and enable if not  
ALTER TABLE account_investigations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for account_investigations table
CREATE POLICY "Allow reading account investigations" 
ON account_investigations 
FOR SELECT 
USING (true);

CREATE POLICY "Allow creating account investigations" 
ON account_investigations 
FOR INSERT 
WITH CHECK (true);