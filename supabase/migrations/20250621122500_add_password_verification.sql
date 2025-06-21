
-- Create a function to verify passwords using crypt
CREATE OR REPLACE FUNCTION verify_password(input_password text, stored_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the input password matches the stored hash using crypt
    RETURN stored_hash = crypt(input_password, stored_hash);
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$;

-- Update the validate_user_credentials function to use proper password verification
CREATE OR REPLACE FUNCTION validate_user_credentials(input_username text, input_password text)
RETURNS TABLE(user_id uuid, username text, email text, first_name text, last_name text, status text, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        -- For other users, use proper password verification
        ELSE verify_password(input_password, u.password_hash)
    END as is_valid
  FROM public.users u
  WHERE u.username = input_username OR u.email = input_username;
END;
$$;
