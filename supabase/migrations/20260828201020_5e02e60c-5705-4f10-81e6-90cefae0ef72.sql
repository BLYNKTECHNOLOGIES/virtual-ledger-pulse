CREATE OR REPLACE FUNCTION public.get_user_display_names(_ids uuid[])
RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), '')
           OR_ELSE_PLACEHOLDER
  FROM public.users u
  WHERE u.id = ANY(_ids)
$$;