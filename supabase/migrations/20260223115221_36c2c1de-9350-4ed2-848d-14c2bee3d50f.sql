
-- Table: terminal_webauthn_credentials
CREATE TABLE public.terminal_webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  sign_count integer NOT NULL DEFAULT 0,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX idx_webauthn_creds_user ON public.terminal_webauthn_credentials(user_id);

-- Table: terminal_biometric_sessions
CREATE TABLE public.terminal_biometric_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  authenticated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 minutes'),
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_bio_sessions_user ON public.terminal_biometric_sessions(user_id);
CREATE INDEX idx_bio_sessions_token ON public.terminal_biometric_sessions(session_token);

-- Table for storing WebAuthn challenges (short-lived)
CREATE TABLE public.terminal_webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  type text NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  used boolean NOT NULL DEFAULT false
);

-- RPC: store_webauthn_credential
CREATE OR REPLACE FUNCTION public.store_webauthn_credential(
  p_user_id uuid,
  p_credential_id text,
  p_public_key text,
  p_device_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.terminal_webauthn_credentials (user_id, credential_id, public_key, device_name)
  VALUES (p_user_id, p_credential_id, p_public_key, p_device_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: get_webauthn_credentials
CREATE OR REPLACE FUNCTION public.get_webauthn_credentials(p_user_id uuid)
RETURNS TABLE(id uuid, credential_id text, public_key text, sign_count integer, device_name text, created_at timestamptz, last_used_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.credential_id, c.public_key, c.sign_count, c.device_name, c.created_at, c.last_used_at
  FROM public.terminal_webauthn_credentials c
  WHERE c.user_id = p_user_id;
END;
$$;

-- RPC: update_webauthn_sign_count
CREATE OR REPLACE FUNCTION public.update_webauthn_sign_count(
  p_credential_id text,
  p_sign_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.terminal_webauthn_credentials
  SET sign_count = p_sign_count, last_used_at = now()
  WHERE credential_id = p_credential_id;
END;
$$;

-- RPC: create_terminal_biometric_session
CREATE OR REPLACE FUNCTION public.create_terminal_biometric_session(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
BEGIN
  -- Revoke any existing active sessions for this user
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  -- Generate a random token
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);

  RETURN v_token;
END;
$$;

-- RPC: validate_terminal_biometric_session
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
  ) INTO v_valid;
  RETURN v_valid;
END;
$$;

-- RPC: extend_terminal_biometric_session
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
  SET expires_at = now() + interval '12 minutes'
  WHERE user_id = p_user_id
    AND session_token = p_token
    AND is_active = true
    AND expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- RPC: revoke_terminal_biometric_session
CREATE OR REPLACE FUNCTION public.revoke_terminal_biometric_session(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
END;
$$;

-- RPC: store_webauthn_challenge
CREATE OR REPLACE FUNCTION public.store_webauthn_challenge(
  p_user_id uuid,
  p_challenge text,
  p_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.terminal_webauthn_challenges (user_id, challenge, type)
  VALUES (p_user_id, p_challenge, p_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: verify_and_consume_challenge
CREATE OR REPLACE FUNCTION public.verify_and_consume_challenge(
  p_user_id uuid,
  p_challenge text,
  p_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_found boolean;
BEGIN
  UPDATE public.terminal_webauthn_challenges
  SET used = true
  WHERE user_id = p_user_id
    AND challenge = p_challenge
    AND type = p_type
    AND used = false
    AND expires_at > now();

  GET DIAGNOSTICS v_found = ROW_COUNT;
  RETURN v_found;
END;
$$;

-- RPC: delete_webauthn_credential (for admin management)
CREATE OR REPLACE FUNCTION public.delete_webauthn_credential(
  p_credential_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
END;
$$;

-- RPC: delete_all_user_webauthn_credentials (for admin reset)
CREATE OR REPLACE FUNCTION public.delete_all_user_webauthn_credentials(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  UPDATE public.terminal_biometric_sessions SET is_active = false WHERE user_id = p_user_id;
END;
$$;
