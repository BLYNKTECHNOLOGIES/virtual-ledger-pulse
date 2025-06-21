
-- Add role_id column to users table to link with roles table
ALTER TABLE public.users 
ADD COLUMN role_id uuid REFERENCES public.roles(id);

-- Add an index for better query performance
CREATE INDEX idx_users_role_id ON public.users(role_id);

-- Set a default role for existing users (optional - you can skip this if you want to handle it manually)
-- This assumes there's a 'User' role in your roles table
UPDATE public.users 
SET role_id = (SELECT id FROM public.roles WHERE name = 'User' LIMIT 1)
WHERE role_id IS NULL;
