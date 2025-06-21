
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
