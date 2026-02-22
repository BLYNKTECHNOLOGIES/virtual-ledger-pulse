-- Add created_by column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

-- Add comment
COMMENT ON COLUMN public.users.created_by IS 'UUID of the user who created this account';