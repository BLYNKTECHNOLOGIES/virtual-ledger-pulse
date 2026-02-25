
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.validate_terminal_bypass_code(
  p_user_id uuid,
  p_code text
)
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
    RETURN NULL;
  END IF;
  
  UPDATE public.terminal_bypass_codes
  SET is_used = true, used_at = now()
  WHERE id = v_bypass_id;
  
  -- Use gen_random_uuid instead of gen_random_bytes to avoid pgcrypto dependency
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
  
  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);
  
  RETURN v_token;
END;
$$;
