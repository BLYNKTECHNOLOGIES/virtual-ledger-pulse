CREATE OR REPLACE FUNCTION public.terminal_save_user_config(p_user_id uuid, p_profile jsonb, p_role_id uuid, p_supervisors uuid[], p_accounts uuid[], p_size_ranges uuid[])
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v uuid := auth.uid(); r record; v_reason text;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.terminal_may_manage_target(v, p_user_id) THEN
    IF v = p_user_id THEN RAISE EXCEPTION 'Only Super Admin or a Terminal admin can change their own Terminal settings.'; END IF;
    RAISE EXCEPTION 'You can only change Terminal settings for people you manage.';
  END IF;

  -- Role step only when the chosen role is not one the person already has.
  IF p_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id = p_role_id) THEN
    FOR r IN SELECT role_id FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id <> p_role_id LOOP
      v_reason := public.um_terminal_refusal(v, p_user_id, r.role_id);
      IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    END LOOP;
    v_reason := public.um_terminal_refusal(v, p_user_id, p_role_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    FOR r IN SELECT role_id FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id <> p_role_id LOOP
      PERFORM public.remove_terminal_role(p_user_id, r.role_id);
    END LOOP;
    PERFORM public.assign_terminal_role(p_user_id, p_role_id, NULL);
  END IF;

  IF p_profile IS NOT NULL THEN
    INSERT INTO terminal_user_profiles (user_id, specialization, shift, is_active, automation_included, select_all_size_ranges)
    VALUES (p_user_id, COALESCE(p_profile->>'specialization','both'), NULLIF(p_profile->>'shift',''),
            COALESCE((p_profile->>'is_active')::boolean, true), COALESCE((p_profile->>'automation_included')::boolean, true),
            COALESCE((p_profile->>'select_all_size_ranges')::boolean, false))
    ON CONFLICT (user_id) DO UPDATE SET specialization = EXCLUDED.specialization, shift = EXCLUDED.shift,
      is_active = EXCLUDED.is_active, automation_included = EXCLUDED.automation_included,
      select_all_size_ranges = EXCLUDED.select_all_size_ranges, updated_at = now();
  END IF;

  -- Supervisors: unchanged rows stay; only removed rows are deleted and only new rows inserted (and checked).
  IF p_supervisors IS NOT NULL THEN
    DELETE FROM terminal_user_supervisor_mappings
      WHERE user_id = p_user_id AND NOT (supervisor_id = ANY (p_supervisors));
    INSERT INTO terminal_user_supervisor_mappings (user_id, supervisor_id)
      SELECT p_user_id, s FROM (SELECT DISTINCT unnest(p_supervisors) s) x
      WHERE NOT EXISTS (SELECT 1 FROM terminal_user_supervisor_mappings m WHERE m.user_id = p_user_id AND m.supervisor_id = x.s);
  END IF;
  IF p_accounts IS NOT NULL THEN
    DELETE FROM terminal_user_exchange_mappings WHERE user_id = p_user_id;
    INSERT INTO terminal_user_exchange_mappings (user_id, exchange_account_id)
      SELECT p_user_id, a FROM (SELECT DISTINCT unnest(p_accounts) a) x;
  END IF;
  IF p_size_ranges IS NOT NULL THEN
    DELETE FROM terminal_user_size_range_mappings WHERE user_id = p_user_id;
    INSERT INTO terminal_user_size_range_mappings (user_id, size_range_id)
      SELECT p_user_id, s FROM (SELECT DISTINCT unnest(p_size_ranges) s) x;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_all_user_webauthn_credentials(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF auth.uid() <> p_user_id THEN
    IF NOT public.has_role(auth.uid(), 'Super Admin')
       AND NOT public.has_role(auth.uid(), 'Admin')
       AND NOT public.has_terminal_permission(auth.uid(), 'terminal_users_manage') THEN
      RAISE EXCEPTION 'Permission denied: terminal_users_manage required to reset biometric registration';
    END IF;
    IF NOT public.terminal_may_manage_target(auth.uid(), p_user_id) THEN
      RAISE EXCEPTION 'You can only reset biometric registration for people you manage.';
    END IF;
  END IF;
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  UPDATE public.terminal_biometric_sessions SET is_active = false WHERE user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_terminal_biometric_invite(p_user_id uuid, p_trust_level text, p_note text DEFAULT NULL::text, p_hours integer DEFAULT 24)
 RETURNS TABLE(invite_id uuid, token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_token text; v_id uuid; v_exp timestamptz;
BEGIN
  IF NOT public.terminal_can_manage_devices(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: only terminal user managers can send a biometric registration link';
  END IF;
  IF NOT public.terminal_may_manage_target(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'You can only send a biometric registration link to people you manage.';
  END IF;
  IF p_trust_level NOT IN ('office','view_only') THEN RAISE EXCEPTION 'Invalid access level'; END IF;
  UPDATE public.terminal_biometric_invites SET revoked_at = now()
  WHERE user_id = p_user_id AND consumed_at IS NULL AND revoked_at IS NULL;
  v_token := replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_');
  v_token := replace(replace(v_token, '+', '-'), '=', '');
  v_exp := now() + make_interval(hours => GREATEST(1, COALESCE(p_hours, 24)));
  INSERT INTO public.terminal_biometric_invites (user_id, token_hash, trust_level, note, created_by, expires_at)
  VALUES (p_user_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_trust_level,
          NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid(), v_exp)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_token, v_exp;
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_terminal_biometric_invite(p_invite_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_target uuid;
BEGIN
  IF NOT public.terminal_can_manage_devices(auth.uid()) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT user_id INTO v_target FROM public.terminal_biometric_invites WHERE id = p_invite_id;
  IF v_target IS NOT NULL AND NOT public.terminal_may_manage_target(auth.uid(), v_target) THEN
    RAISE EXCEPTION 'You can only cancel biometric registration links for people you manage.';
  END IF;
  UPDATE public.terminal_biometric_invites SET revoked_at = now()
  WHERE id = p_invite_id AND consumed_at IS NULL AND revoked_at IS NULL;
END $function$;