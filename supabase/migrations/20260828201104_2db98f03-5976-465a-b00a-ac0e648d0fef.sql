CREATE OR REPLACE FUNCTION public.get_user_display_names(_ids uuid[])
RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         COALESCE(
           NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''),
           NULLIF(TRIM(u.username), ''),
           u.email
         ) AS display_name
  FROM public.users u
  WHERE u.id = ANY(_ids)
$$;

REVOKE ALL ON FUNCTION public.get_user_display_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_display_names(uuid[]) TO authenticated, service_role;