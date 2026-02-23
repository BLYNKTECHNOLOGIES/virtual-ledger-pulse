
CREATE OR REPLACE FUNCTION public.verify_terminal_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.p2p_terminal_user_roles
    WHERE user_id = p_user_id
  );
END;
$$;
