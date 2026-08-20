DROP VIEW IF EXISTS public.users_directory;

CREATE OR REPLACE FUNCTION public.users_directory()
RETURNS TABLE(
  id uuid,
  username text,
  first_name text,
  last_name text,
  avatar_url text,
  status text,
  role_id uuid,
  badge_id text,
  department_id uuid,
  position_id uuid,
  last_activity timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.status,
         u.role_id, u.badge_id, u.department_id, u.position_id, u.last_activity, u.created_at
  FROM public.users u
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.users_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.users_directory() TO authenticated, service_role;