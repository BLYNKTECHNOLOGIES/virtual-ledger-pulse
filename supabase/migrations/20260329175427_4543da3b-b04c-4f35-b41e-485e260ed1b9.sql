-- Fix terminal biometric token generation on projects where pgcrypto is installed in extensions schema
-- Root cause: functions with search_path=public called gen_random_bytes() unqualified
-- and failed with 42883 (function does not exist).

CREATE OR REPLACE FUNCTION public.create_terminal_biometric_session(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);

  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'login_biometric', '{}');

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_terminal_bypass_code(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bypass_id uuid;
  v_token text;
BEGIN
  SELECT id INTO v_bypass_id
  FROM public.terminal_bypass_codes
  WHERE user_id = p_user_id
    AND code = p_code
    AND is_used = false
    AND expires_at > now();

  IF v_bypass_id IS NULL THEN
    INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
    VALUES (p_user_id, 'login_failed', jsonb_build_object('method', 'bypass_code'));
    RETURN NULL;
  END IF;

  UPDATE public.terminal_bypass_codes
  SET is_used = true, used_at = now()
  WHERE id = v_bypass_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);

  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'login_bypass', '{}');

  RETURN v_token;
END;
$$;