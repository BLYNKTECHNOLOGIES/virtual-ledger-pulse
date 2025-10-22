-- Fix validate_user_credentials to use extensions.crypt
CREATE OR REPLACE FUNCTION validate_user_credentials(
  input_username TEXT,
  input_password TEXT
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT,
  is_valid BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.status,
    CASE 
        -- For demo admin user, check if password matches exactly (temporary for demo)
        WHEN u.email = 'blynkvirtualtechnologiespvtld@gmail.com' AND input_password = 'Blynk@0717' THEN true
        -- For all other users, use proper bcrypt password verification
        ELSE (u.password_hash = extensions.crypt(input_password, u.password_hash))
    END as is_valid
  FROM public.users u
  WHERE u.username = input_username OR u.email = input_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions';

-- Fix admin_reset_user_password to use extensions.crypt
CREATE OR REPLACE FUNCTION admin_reset_user_password(
  user_email TEXT,
  new_password TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update the user's password
  UPDATE users
  SET 
    password_hash = extensions.crypt(new_password, extensions.gen_salt('bf')),
    updated_at = now()
  WHERE email = user_email;
  
  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions';