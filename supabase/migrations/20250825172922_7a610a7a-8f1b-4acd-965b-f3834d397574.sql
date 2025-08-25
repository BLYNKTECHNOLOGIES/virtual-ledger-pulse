-- Fix database constraints that are preventing employee registration

-- 1. Make date_of_joining nullable temporarily to avoid null constraint errors
ALTER TABLE public.employees ALTER COLUMN date_of_joining DROP NOT NULL;

-- 2. Check what employee_type values are currently allowed
-- Drop the restrictive check constraint on employee_type
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_employee_type_check;

-- 3. Add a more flexible check constraint for employee_type
ALTER TABLE public.employees ADD CONSTRAINT employees_employee_type_check 
CHECK (employee_type IN ('Full-time', 'Part-time', 'Contract', 'Intern', 'Consultant', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'));

-- 4. Drop restrictive marital_status check constraint and add flexible one
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_marital_status_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_marital_status_check 
CHECK (marital_status IN ('Single', 'Married', 'Divorced', 'Widowed', 'SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'));

-- 5. Drop restrictive gender check constraint and add flexible one  
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_gender_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_gender_check 
CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say', 'MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'));

-- 6. Make salary nullable since it might not always be provided immediately
ALTER TABLE public.employees ALTER COLUMN salary DROP NOT NULL;