-- ======== Phase A: remove the office-code / office-network guard ========
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'zz_terminal_view_only_guard' AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_terminal_view_only_guard ON public.%I', r.relname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.terminal_guard_view_only() CASCADE;
DROP FUNCTION IF EXISTS public.terminal_write_allowed(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.terminal_ip_is_office(text) CASCADE;
DROP FUNCTION IF EXISTS public.issue_terminal_office_enrolment_code(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.consume_terminal_office_enrolment_code(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.set_terminal_session_mode(uuid, text, text, text, text) CASCADE;

DROP TABLE IF EXISTS public.terminal_device_enrolment_codes;
DROP TABLE IF EXISTS public.terminal_trusted_networks;
DROP TABLE IF EXISTS public.terminal_device_guard_settings;
DROP TABLE IF EXISTS public.terminal_view_only_write_allowlist;

-- ======== Phase B: emailed registration invites ========
CREATE TABLE IF NOT EXISTS public.terminal_biometric_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  trust_level text NOT NULL,
  note text,
  created_by uuid,
  sent_to_email text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  consumed_credential_id text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_biometric_invites_trust_chk CHECK (trust_level IN ('office','view_only'))
);

GRANT SELECT ON public.terminal_biometric_invites TO authenticated;
GRANT ALL ON public.terminal_biometric_invites TO service_role;
ALTER TABLE public.terminal_biometric_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites readable by terminal managers" ON public.terminal_biometric_invites;
CREATE POLICY "invites readable by terminal managers"
  ON public.terminal_biometric_invites FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'Super Admin')
    OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage')
    OR user_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_terminal_biometric_invites_user
  ON public.terminal_biometric_invites (user_id, consumed_at, revoked_at, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_biometric_invites_token
  ON public.terminal_biometric_invites (token_hash);

DROP TRIGGER IF EXISTS trg_terminal_biometric_invites_updated ON public.terminal_biometric_invites;
CREATE TRIGGER trg_terminal_biometric_invites_updated
  BEFORE UPDATE ON public.terminal_biometric_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- who may manage invites
CREATE OR REPLACE FUNCTION public.terminal_can_manage_devices(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'Super Admin')
      OR public.has_terminal_permission(p_user_id, 'terminal_users_manage');
$$;

-- create an invite; returns the raw one-time token (only the hash is stored)
CREATE OR REPLACE FUNCTION public.create_terminal_biometric_invite(
  p_user_id uuid,
  p_trust_level text,
  p_note text DEFAULT NULL,
  p_hours integer DEFAULT 24
)
RETURNS TABLE (invite_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_id uuid;
  v_exp timestamptz;
BEGIN
  IF NOT public.terminal_can_manage_devices(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: only terminal user managers can send a biometric registration link';
  END IF;
  IF p_trust_level NOT IN ('office','view_only') THEN
    RAISE EXCEPTION 'Invalid access level';
  END IF;

  -- one live invite per user: supersede anything still pending
  UPDATE public.terminal_biometric_invites
  SET revoked_at = now()
  WHERE user_id = p_user_id AND consumed_at IS NULL AND revoked_at IS NULL;

  v_token := replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_');
  v_token := replace(replace(v_token, '+', '-'), '=', '');
  v_exp := now() + make_interval(hours => GREATEST(1, COALESCE(p_hours, 24)));

  INSERT INTO public.terminal_biometric_invites (user_id, token_hash, trust_level, note, created_by, expires_at)
  VALUES (
    p_user_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_trust_level,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    auth.uid(),
    v_exp
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, v_exp;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_terminal_biometric_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.terminal_can_manage_devices(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  UPDATE public.terminal_biometric_invites
  SET revoked_at = now()
  WHERE id = p_invite_id AND consumed_at IS NULL AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.list_terminal_biometric_invites()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_name text,
  trust_level text,
  note text,
  sent_to_email text,
  expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.user_id,
         COALESCE(NULLIF(btrim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username) AS user_name,
         i.trust_level, i.note, i.sent_to_email, i.expires_at, i.consumed_at, i.revoked_at, i.created_at
  FROM public.terminal_biometric_invites i
  LEFT JOIN public.users u ON u.id = i.user_id
  WHERE public.terminal_can_manage_devices(auth.uid())
  ORDER BY i.created_at DESC
  LIMIT 200;
$$;

-- server-side consumption at registration time
CREATE OR REPLACE FUNCTION public.consume_terminal_biometric_invite(
  p_user_id uuid,
  p_token text,
  p_credential_id text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row public.terminal_biometric_invites;
BEGIN
  SELECT * INTO v_row
  FROM public.terminal_biometric_invites
  WHERE user_id = p_user_id
    AND token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
    AND consumed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.terminal_biometric_invites
  SET consumed_at = now(), consumed_credential_id = p_credential_id
  WHERE id = v_row.id;

  RETURN v_row.trust_level;
END $$;

-- describe an invite to the employee opening the link (no token leakage)
CREATE OR REPLACE FUNCTION public.describe_terminal_biometric_invite(p_token text)
RETURNS TABLE (trust_level text, note text, expires_at timestamptz, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT i.trust_level, i.note, i.expires_at, i.user_id
  FROM public.terminal_biometric_invites i
  WHERE i.token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
    AND i.user_id = auth.uid()
    AND i.consumed_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.create_terminal_biometric_invite(uuid, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_terminal_biometric_invite(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_terminal_biometric_invite(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_terminal_biometric_invite(uuid, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_terminal_biometric_invite(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_terminal_biometric_invites() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.describe_terminal_biometric_invite(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_can_manage_devices(uuid) TO authenticated, service_role;