
-- ============ Phase 2: mode-aware sessions, enrolment codes, guard ============

REVOKE EXECUTE ON FUNCTION public.terminal_session_mode(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.terminal_write_allowed(uuid, text) FROM anon;

-- ---------- office network matching ----------
CREATE OR REPLACE FUNCTION public.terminal_ip_is_office(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_net record; v_ip inet;
BEGIN
  IF p_ip IS NULL OR btrim(p_ip) = '' THEN RETURN false; END IF;
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  FOR v_net IN SELECT cidr FROM public.terminal_trusted_networks WHERE is_active LOOP
    BEGIN
      IF v_ip <<= v_net.cidr::inet THEN RETURN true; END IF;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN false;
END;
$$;

-- ---------- mode-aware session creation ----------
CREATE OR REPLACE FUNCTION public.create_terminal_biometric_session_v2(
  p_user_id uuid,
  p_mode text DEFAULT 'full',
  p_credential_id text DEFAULT NULL,
  p_client_ip text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_token text; v_mode text;
BEGIN
  IF NOT public.has_terminal_access(p_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;
  v_mode := CASE WHEN p_mode = 'view_only' THEN 'view_only' ELSE 'full' END;

  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.terminal_biometric_sessions
    (user_id, session_token, mode, credential_id, client_ip, enforced_reason)
  VALUES (p_user_id, v_token, v_mode, p_credential_id, p_client_ip, p_reason);

  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'login_biometric',
          jsonb_build_object('mode', v_mode, 'reason', p_reason, 'client_ip', p_client_ip));

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_terminal_biometric_session(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.create_terminal_biometric_session_v2(p_user_id, 'full', NULL, NULL, 'legacy_call');
$$;

CREATE OR REPLACE FUNCTION public.get_terminal_session_mode_for_token(p_user_id uuid, p_token text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.mode
  FROM public.terminal_biometric_sessions s
  WHERE s.user_id = p_user_id
    AND s.session_token = p_token
    AND s.is_active = true
    AND s.expires_at > now()
    AND (s.max_expires_at IS NULL OR s.max_expires_at > now())
  LIMIT 1;
$$;

-- ---------- credential storage with trust level ----------
CREATE OR REPLACE FUNCTION public.store_webauthn_credential_v2(
  p_user_id uuid,
  p_credential_id text,
  p_public_key text,
  p_device_name text DEFAULT NULL,
  p_trust_level text DEFAULT 'view_only',
  p_enrolled_ip text DEFAULT NULL,
  p_enrolled_via text DEFAULT 'self_view_only',
  p_approved_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (current_setting('request.jwt.claims', true)::json ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.terminal_webauthn_credentials
    (user_id, credential_id, public_key, device_name, trust_level, enrolled_ip, enrolled_via, approved_by)
  VALUES (p_user_id, p_credential_id, p_public_key, p_device_name,
          CASE WHEN p_trust_level = 'office' THEN 'office' ELSE 'view_only' END,
          p_enrolled_ip, p_enrolled_via, p_approved_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- office enrolment codes ----------
CREATE OR REPLACE FUNCTION public.issue_terminal_office_enrolment_code(p_user_id uuid, p_issued_by uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.has_role(p_issued_by, 'Super Admin') THEN
    RAISE EXCEPTION 'Only Super Admins can authorise an office device';
  END IF;
  IF (SELECT count(*) FROM public.terminal_device_enrolment_codes
      WHERE user_id = p_user_id AND created_at > now() - interval '15 minutes') >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 5 enrolment codes per 15 minutes';
  END IF;

  UPDATE public.terminal_device_enrolment_codes
  SET consumed_at = now(), consumed_credential_id = 'superseded'
  WHERE user_id = p_user_id AND consumed_at IS NULL;

  v_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));

  INSERT INTO public.terminal_device_enrolment_codes (user_id, code, issued_by)
  VALUES (p_user_id, v_code, p_issued_by);

  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_issued_by, 'office_enrolment_code_issued', jsonb_build_object('target_user_id', p_user_id));

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_terminal_office_enrolment_code(
  p_user_id uuid, p_code text, p_credential_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_row public.terminal_device_enrolment_codes;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (current_setting('request.jwt.claims', true)::json ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_row FROM public.terminal_device_enrolment_codes
  WHERE user_id = p_user_id
    AND upper(code) = upper(btrim(p_code))
    AND consumed_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_row.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.terminal_device_enrolment_codes
  SET consumed_at = now(), consumed_credential_id = p_credential_id
  WHERE id = v_row.id;

  RETURN v_row.issued_by;
END;
$$;

-- ---------- device administration ----------
CREATE OR REPLACE FUNCTION public.set_terminal_device_trust(p_credential_id uuid, p_trust_level text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'Super Admin') THEN
    RAISE EXCEPTION 'Only Super Admins can change device trust';
  END IF;
  UPDATE public.terminal_webauthn_credentials
  SET trust_level = CASE WHEN p_trust_level = 'office' THEN 'office' ELSE 'view_only' END,
      approved_by = auth.uid(),
      enrolled_via = COALESCE(enrolled_via, 'admin_set')
  WHERE id = p_credential_id;
  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (auth.uid(), 'device_trust_changed',
          jsonb_build_object('credential', p_credential_id, 'trust_level', p_trust_level));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_terminal_device(p_credential_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_user uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'Super Admin') THEN
    RAISE EXCEPTION 'Only Super Admins can revoke a device';
  END IF;
  SELECT user_id INTO v_user FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
  DELETE FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
  UPDATE public.terminal_biometric_sessions SET is_active = false
  WHERE user_id = v_user AND is_active = true;
  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (auth.uid(), 'device_revoked',
          jsonb_build_object('credential', p_credential_id, 'target_user_id', v_user));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_terminal_devices()
RETURNS TABLE(
  id uuid, user_id uuid, user_name text, device_name text, trust_level text,
  enrolled_ip text, enrolled_via text, created_at timestamptz, last_used_at timestamptz,
  active_session_mode text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.user_id,
         COALESCE(NULLIF(btrim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, u.email) AS user_name,
         c.device_name, c.trust_level, c.enrolled_ip, c.enrolled_via, c.created_at, c.last_used_at,
         (SELECT s.mode FROM public.terminal_biometric_sessions s
           WHERE s.user_id = c.user_id AND s.is_active = true AND s.expires_at > now()
           ORDER BY s.authenticated_at DESC LIMIT 1) AS active_session_mode
  FROM public.terminal_webauthn_credentials c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE auth.uid() IS NOT NULL
    AND (public.has_role(auth.uid(), 'Super Admin')
         OR public.has_terminal_permission(auth.uid(), 'terminal_users_view')
         OR c.user_id = auth.uid())
  ORDER BY user_name NULLS LAST, c.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.terminal_ip_is_office(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_terminal_devices() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_terminal_device_trust(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_terminal_device(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_terminal_office_enrolment_code(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_webauthn_credential_v2(uuid, text, text, text, text, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_terminal_office_enrolment_code(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_terminal_biometric_session_v2(uuid, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_terminal_session_mode_for_token(uuid, text) FROM anon;

-- ---------- the guard ----------
CREATE OR REPLACE FUNCTION public.terminal_guard_view_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enf text;
  v_tbl text := TG_TABLE_NAME;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT enforcement_mode INTO v_enf FROM public.terminal_device_guard_settings WHERE id;
  IF v_enf IS NULL OR v_enf = 'off' THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM public.terminal_view_only_write_allowlist a WHERE a.table_name = v_tbl) THEN
    RETURN NULL;
  END IF;

  IF public.terminal_session_mode(v_uid) <> 'view_only' THEN RETURN NULL; END IF;

  INSERT INTO public.terminal_view_only_denials
    (user_id, session_mode, object_name, operation, enforcement_mode)
  VALUES (v_uid, 'view_only', v_tbl, TG_OP, v_enf);

  IF v_enf = 'enforce' THEN
    RAISE EXCEPTION 'View-only device: % on % is not permitted', TG_OP, v_tbl
      USING ERRCODE = '42501',
            HINT = 'You are signed in on a personal (view-only) device. Use an office computer to perform this action.';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.terminal_guard_attach_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN (SELECT table_name FROM public.terminal_view_only_write_allowlist)
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = c.oid AND t.tgname = 'zz_terminal_view_only_guard'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER zz_terminal_view_only_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.terminal_guard_view_only()',
      r.relname
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.terminal_guard_attach_all() FROM anon, authenticated;

SELECT public.terminal_guard_attach_all();
