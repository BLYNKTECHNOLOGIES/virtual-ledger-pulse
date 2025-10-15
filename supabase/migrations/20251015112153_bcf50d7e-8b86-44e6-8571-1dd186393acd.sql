-- Function to update user password with current password verification
CREATE OR REPLACE FUNCTION public.update_user_password(
  user_id UUID,
  new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the password with bcrypt hashing
  UPDATE public.users
  SET 
    password_hash = crypt(new_password, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;