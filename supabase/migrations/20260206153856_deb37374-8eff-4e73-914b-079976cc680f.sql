
-- Add force_logout_at column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS force_logout_at timestamptz;

-- Update the admin_reset_user_password function to also set force_logout_at
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(p_user_id uuid, p_new_password text)
RETURNS boolean AS $$
BEGIN
    UPDATE users
    SET 
        password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        force_logout_at = now(),
        updated_at = now()
    WHERE id = p_user_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
