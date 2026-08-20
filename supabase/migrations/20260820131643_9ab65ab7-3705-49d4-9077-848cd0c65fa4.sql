CREATE OR REPLACE FUNCTION public.get_webauthn_credentials(p_user_id uuid)
RETURNS TABLE (id uuid, credential_id text, public_key text, sign_count integer, device_name text, created_at timestamptz, last_used_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted server-side callers (edge functions using the service role) have no auth.uid().
  IF current_setting('role', true) <> 'service_role'
     AND (current_setting('request.jwt.claims', true)::json ->> 'role') IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR (auth.uid() <> p_user_id
       AND NOT public.has_role(auth.uid(), 'Super Admin')
       AND NOT public.has_role(auth.uid(), 'Admin')) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT c.id, c.credential_id, c.public_key, c.sign_count, c.device_name, c.created_at, c.last_used_at
  FROM public.terminal_webauthn_credentials c
  WHERE c.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_webauthn_credential(p_user_id uuid, p_credential_id text, p_public_key text, p_device_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (current_setting('request.jwt.claims', true)::json ->> 'role') IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR (auth.uid() <> p_user_id
       AND NOT public.has_role(auth.uid(), 'Super Admin')
       AND NOT public.has_role(auth.uid(), 'Admin')) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  INSERT INTO public.terminal_webauthn_credentials (user_id, credential_id, public_key, device_name)
  VALUES (p_user_id, p_credential_id, p_public_key, p_device_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_webauthn_credentials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_webauthn_credential(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_webauthn_credentials(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_webauthn_credential(uuid, text, text, text) TO authenticated, service_role;