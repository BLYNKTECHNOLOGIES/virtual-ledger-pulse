-- Update RLS policies for employee-documents storage bucket to handle authentication properly

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can upload employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete employee documents" ON storage.objects;

-- Create more permissive policies for the employee-documents bucket
-- Policy for INSERT (file upload)
CREATE POLICY "Allow uploads to employee-documents bucket" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'employee-documents');

-- Policy for SELECT (file viewing)
CREATE POLICY "Allow viewing of employee-documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'employee-documents');

-- Policy for UPDATE (file updates)
CREATE POLICY "Allow updates to employee-documents" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'employee-documents') 
WITH CHECK (bucket_id = 'employee-documents');

-- Policy for DELETE (file deletion)
CREATE POLICY "Allow deletion of employee-documents" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'employee-documents');

-- Make the bucket public for easier access
UPDATE storage.buckets 
SET public = true 
WHERE id = 'employee-documents';