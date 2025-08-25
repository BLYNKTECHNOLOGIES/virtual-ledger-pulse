-- Remove the foreign key constraint from employees table
-- since not all employees need to be system users
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_user_id_fkey;

-- Make user_id nullable since it's not always needed
ALTER TABLE public.employees ALTER COLUMN user_id DROP NOT NULL;