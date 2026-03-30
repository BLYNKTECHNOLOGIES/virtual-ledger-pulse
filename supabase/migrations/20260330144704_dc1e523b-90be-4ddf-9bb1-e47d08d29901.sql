
-- P18-SEC-01: Remove hardcoded admin password backdoor from validate_user_credentials
-- All logins must go through the crypt() hash comparison path
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
    (u.password_hash = extensions.crypt(input_password, u.password_hash)) as is_valid
  FROM public.users u
  WHERE (LOWER(u.username) = LOWER(input_username) OR LOWER(u.email) = LOWER(input_username))
    AND LOWER(u.status) = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions';

-- P18-SEC-02: Drop anonymous read policies on user_roles and roles tables
-- Prevents unauthenticated users from enumerating user IDs and roles
DROP POLICY IF EXISTS "anon_read_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "anon_read_roles" ON public.roles;
