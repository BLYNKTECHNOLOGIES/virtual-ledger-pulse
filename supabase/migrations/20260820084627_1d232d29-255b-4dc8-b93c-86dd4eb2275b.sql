CREATE OR REPLACE FUNCTION public.complete_forced_password_change()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.users
  SET force_password_change = false,
      updated_at = now()
  WHERE id = v_user_id
    AND force_password_change IS DISTINCT FROM false;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'ERP user account not found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_forced_password_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_forced_password_change() FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_forced_password_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_forced_password_change() TO service_role;