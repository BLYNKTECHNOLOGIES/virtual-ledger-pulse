
-- Table for temporary bypass codes (Super Admin only)
CREATE TABLE IF NOT EXISTS public.terminal_bypass_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  generated_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  used_at timestamptz,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bypass_codes_user ON public.terminal_bypass_codes(user_id);
CREATE INDEX idx_bypass_codes_code ON public.terminal_bypass_codes(code);

-- Function to generate a bypass code (6-digit numeric)
CREATE OR REPLACE FUNCTION public.generate_terminal_bypass_code(
  p_user_id uuid,
  p_generated_by uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  -- Generate a 6-digit code
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  
  -- Invalidate any existing unused codes for this user
  UPDATE public.terminal_bypass_codes
  SET is_used = true
  WHERE user_id = p_user_id AND is_used = false;
  
  -- Insert new code
  INSERT INTO public.terminal_bypass_codes (user_id, code, generated_by)
  VALUES (p_user_id, v_code, p_generated_by);
  
  RETURN v_code;
END;
$$;

-- Function to validate and consume a bypass code, returns session token
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
  -- Find valid code
  SELECT id INTO v_bypass_id
  FROM public.terminal_bypass_codes
  WHERE user_id = p_user_id
    AND code = p_code
    AND is_used = false
    AND expires_at > now();
  
  IF v_bypass_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Mark as used
  UPDATE public.terminal_bypass_codes
  SET is_used = true, used_at = now()
  WHERE id = v_bypass_id;
  
  -- Create a biometric session for the user
  v_token := encode(gen_random_bytes(32), 'hex');
  
  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);
  
  RETURN v_token;
END;
$$;

ALTER TABLE public.terminal_bypass_codes ENABLE ROW LEVEL SECURITY;
