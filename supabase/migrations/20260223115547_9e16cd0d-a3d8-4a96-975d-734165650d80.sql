
-- Add absolute max lifetime to biometric sessions (no indefinite extension)
ALTER TABLE public.terminal_biometric_sessions 
  ADD COLUMN IF NOT EXISTS max_expires_at timestamptz;

-- Set default: max lifetime = 4 hours from creation regardless of extensions
UPDATE public.terminal_biometric_sessions 
SET max_expires_at = authenticated_at + interval '4 hours'
WHERE max_expires_at IS NULL;

ALTER TABLE public.terminal_biometric_sessions 
  ALTER COLUMN max_expires_at SET DEFAULT (now() + interval '4 hours');

-- Add max extend count to prevent infinite extension
ALTER TABLE public.terminal_biometric_sessions 
  ADD COLUMN IF NOT EXISTS extend_count integer NOT NULL DEFAULT 0;

-- Replace extend function with capped version
CREATE OR REPLACE FUNCTION public.extend_terminal_biometric_session(
  p_user_id uuid,
  p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE public.terminal_biometric_sessions
  SET expires_at = now() + interval '12 minutes',
      extend_count = extend_count + 1
  WHERE user_id = p_user_id
    AND session_token = p_token
    AND is_active = true
    AND expires_at > now()
    AND max_expires_at > now()
    AND extend_count < 20;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Update validate to also check max_expires_at
CREATE OR REPLACE FUNCTION public.validate_terminal_biometric_session(
  p_user_id uuid,
  p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.terminal_biometric_sessions
    WHERE user_id = p_user_id
      AND session_token = p_token
      AND is_active = true
      AND expires_at > now()
      AND (max_expires_at IS NULL OR max_expires_at > now())
  ) INTO v_valid;
  RETURN v_valid;
END;
$$;

-- RPC: verify user has terminal access (for edge function to call)
CREATE OR REPLACE FUNCTION public.verify_terminal_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.terminal_user_roles
    WHERE user_id = p_user_id
  );
END;
$$;

-- RPC: log biometric event to system_action_logs
CREATE OR REPLACE FUNCTION public.log_biometric_event(
  p_user_id uuid,
  p_action_type text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.system_action_logs (user_id, action_type, description, metadata)
  VALUES (p_user_id, p_action_type, p_description, p_metadata);
END;
$$;
