-- Check current gender constraint and fix it
-- First, let's see what the current constraint allows
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%gender%';

-- Drop the existing gender check constraint if it exists
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_gender_check;

-- Create a new gender constraint that allows the common values
ALTER TABLE employees ADD CONSTRAINT employees_gender_check 
CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say') OR gender IS NULL);

-- Also check if we have any file upload storage setup
SELECT name, public FROM storage.buckets WHERE name IN ('employee-documents', 'documents');