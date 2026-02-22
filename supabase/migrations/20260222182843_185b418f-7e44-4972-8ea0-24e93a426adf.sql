-- Create RPC to log user activity (login/logout) with IP - uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.log_user_activity(
  _user_id uuid,
  _action text,
  _description text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_activity_log (user_id, action, description, ip_address, user_agent, metadata)
  VALUES (_user_id, _action, _description, _ip_address, _user_agent, _metadata);
END;
$$;

-- Also update users.last_login when login is logged
CREATE OR REPLACE FUNCTION public.update_last_login(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET last_login = now() WHERE id = _user_id;
END;
$$;