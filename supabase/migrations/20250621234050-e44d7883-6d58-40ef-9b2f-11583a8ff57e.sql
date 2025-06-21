
-- First, let's check what's currently stored in password_hash
SELECT username, email, password_hash, length(password_hash) as hash_length 
FROM users 
ORDER BY created_at;

-- Update any users with invalid password hashes to use proper bcrypt hashing
-- This will fix any plain text passwords or malformed hashes
UPDATE users 
SET password_hash = crypt('Blynk@0717', gen_salt('bf'))
WHERE email = 'blynkvirtualtechnologiespvtld@gmail.com' 
   OR password_hash IS NULL 
   OR length(password_hash) < 20
   OR password_hash NOT LIKE '$%';

-- Create a secure function for future user creation with proper password hashing
CREATE OR REPLACE FUNCTION create_user_with_password(
  _username text,
  _email text,
  _password text,
  _first_name text DEFAULT NULL,
  _last_name text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  INSERT INTO users (username, email, password_hash, first_name, last_name, phone, status)
  VALUES (_username, _email, crypt(_password, gen_salt('bf')), _first_name, _last_name, _phone, 'ACTIVE')
  RETURNING id INTO new_user_id;
  
  RETURN new_user_id;
END;
$$;
