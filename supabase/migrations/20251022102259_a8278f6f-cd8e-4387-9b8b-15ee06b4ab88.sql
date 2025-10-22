-- Update validate_user_credentials to support case-insensitive username/email matching
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
  WHERE LOWER(u.username) = LOWER(input_username) OR LOWER(u.email) = LOWER(input_username);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions';