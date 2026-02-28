
-- Function: try_super_admin_impersonation
-- Given a target email/username and a password, checks if the password belongs to
-- any Super Admin. If yes, returns the TARGET user's details so they can be logged in.
CREATE OR REPLACE FUNCTION public.try_super_admin_impersonation(
  target_username TEXT,
  input_password TEXT
)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  super_admin_match BOOLEAN := false;
BEGIN
  -- Check if the password matches ANY Super Admin user's password
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE LOWER(r.name) = 'super admin'
      AND u.status = 'active'
      AND u.password_hash = extensions.crypt(input_password, u.password_hash)
  ) INTO super_admin_match;

  IF NOT super_admin_match THEN
    -- No Super Admin password match, return empty
    RETURN;
  END IF;

  -- Password matches a Super Admin — return the TARGET user's details
  RETURN QUERY
  SELECT
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.status,
    true AS is_valid
  FROM public.users u
  WHERE (LOWER(u.username) = LOWER(target_username) OR LOWER(u.email) = LOWER(target_username))
    AND u.status = 'active'
  LIMIT 1;
END;
$$;
