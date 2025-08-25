-- Enable RLS and create policies for departments table
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all users to read departments
CREATE POLICY "Allow all users to read departments" 
ON public.departments 
FOR SELECT 
USING (true);

-- Create policy to allow all users to manage departments
CREATE POLICY "Allow all users to manage departments" 
ON public.departments 
FOR ALL 
USING (true) 
WITH CHECK (true);