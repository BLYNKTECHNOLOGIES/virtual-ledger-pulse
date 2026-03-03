
CREATE OR REPLACE FUNCTION public.get_super_admin_ids()
RETURNS TABLE(user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id AS user_id
  FROM public.users u
  JOIN public.user_roles ur ON ur.user_id = u.id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE LOWER(r.name) = 'super admin'
    AND LOWER(u.status) = 'active';
$$;
