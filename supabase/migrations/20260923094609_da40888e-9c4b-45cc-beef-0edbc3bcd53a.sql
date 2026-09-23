
CREATE OR REPLACE FUNCTION public.set_terminal_session_mode(
  p_user_id uuid, p_token text, p_mode text, p_reason text DEFAULT NULL, p_client_ip text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_rows integer;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (current_setting('request.jwt.claims', true)::json ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.terminal_biometric_sessions
  SET mode = CASE WHEN p_mode = 'view_only' THEN 'view_only' ELSE 'full' END,
      enforced_reason = COALESCE(p_reason, enforced_reason),
      client_ip = COALESCE(p_client_ip, client_ip)
  WHERE user_id = p_user_id AND session_token = p_token AND is_active = true;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_terminal_session_mode(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_terminal_session_mode(uuid, text, text, text, text) TO service_role;
