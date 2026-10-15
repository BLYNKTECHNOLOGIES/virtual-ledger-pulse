CREATE OR REPLACE FUNCTION public.delete_webauthn_credential(p_credential_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT user_id INTO v_owner FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF auth.uid() <> v_owner THEN
    IF NOT public.has_role(auth.uid(), 'Super Admin') AND NOT public.has_role(auth.uid(), 'Admin') THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
    IF NOT public.terminal_may_manage_target(auth.uid(), v_owner) THEN
      RAISE EXCEPTION 'You can only remove passkeys for people you manage.';
    END IF;
  END IF;
  DELETE FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
END $function$;

CREATE OR REPLACE FUNCTION public.terminal_stamp_assigned_by()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null then new.assigned_by := auth.uid(); end if;
  return new;
end $function$;

-- May this person add a mapping to this Binance account? Admins any; others only accounts they use.
CREATE OR REPLACE FUNCTION public.terminal_may_grant_account(p_uid uuid, p_account uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT p_uid IS NOT NULL AND (public.terminal_is_admin(p_uid) OR p_account = ANY (public.binance_accounts_for_user(p_uid)))
$$;
REVOKE ALL ON FUNCTION public.terminal_may_grant_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminal_may_grant_account(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS terminal_mappings_insert ON public.terminal_user_exchange_mappings;
CREATE POLICY terminal_mappings_insert ON public.terminal_user_exchange_mappings FOR INSERT TO authenticated
  WITH CHECK (public.terminal_may_manage_target(auth.uid(), user_id) AND public.terminal_may_grant_account(auth.uid(), exchange_account_id));
DROP POLICY IF EXISTS terminal_mappings_update ON public.terminal_user_exchange_mappings;
CREATE POLICY terminal_mappings_update ON public.terminal_user_exchange_mappings FOR UPDATE TO authenticated
  USING (public.terminal_may_manage_target(auth.uid(), user_id))
  WITH CHECK (public.terminal_may_manage_target(auth.uid(), user_id) AND public.terminal_may_grant_account(auth.uid(), exchange_account_id));

CREATE OR REPLACE FUNCTION public.terminal_save_user_config(p_user_id uuid, p_profile jsonb, p_role_id uuid, p_supervisors uuid[], p_accounts uuid[], p_size_ranges uuid[])
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v uuid := auth.uid(); r record; v_reason text; v_bad uuid;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.terminal_may_manage_target(v, p_user_id) THEN
    IF v = p_user_id THEN RAISE EXCEPTION 'Only Super Admin or a Terminal admin can change their own Terminal settings.'; END IF;
    RAISE EXCEPTION 'You can only change Terminal settings for people you manage.';
  END IF;

  -- Account check up front: only new mappings, only accounts the editor may use (admins any).
  IF p_accounts IS NOT NULL THEN
    SELECT a INTO v_bad FROM (SELECT DISTINCT unnest(p_accounts) a) x
     WHERE NOT EXISTS (SELECT 1 FROM terminal_user_exchange_mappings m WHERE m.user_id = p_user_id AND m.exchange_account_id = x.a)
       AND NOT public.terminal_may_grant_account(v, x.a) LIMIT 1;
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'You can only give access to Binance accounts you can use yourself.'; END IF;
  END IF;

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

  IF p_supervisors IS NOT NULL THEN
    DELETE FROM terminal_user_supervisor_mappings
      WHERE user_id = p_user_id AND NOT (supervisor_id = ANY (p_supervisors));
    INSERT INTO terminal_user_supervisor_mappings (user_id, supervisor_id)
      SELECT p_user_id, s FROM (SELECT DISTINCT unnest(p_supervisors) s) x
      WHERE NOT EXISTS (SELECT 1 FROM terminal_user_supervisor_mappings m WHERE m.user_id = p_user_id AND m.supervisor_id = x.s);
  END IF;
  -- Accounts: kept rows stay, removed rows are deleted, only new rows inserted.
  IF p_accounts IS NOT NULL THEN
    DELETE FROM terminal_user_exchange_mappings
      WHERE user_id = p_user_id AND NOT (exchange_account_id = ANY (p_accounts));
    INSERT INTO terminal_user_exchange_mappings (user_id, exchange_account_id)
      SELECT p_user_id, a FROM (SELECT DISTINCT unnest(p_accounts) a) x
      WHERE NOT EXISTS (SELECT 1 FROM terminal_user_exchange_mappings m WHERE m.user_id = p_user_id AND m.exchange_account_id = x.a);
  END IF;
  IF p_size_ranges IS NOT NULL THEN
    DELETE FROM terminal_user_size_range_mappings WHERE user_id = p_user_id;
    INSERT INTO terminal_user_size_range_mappings (user_id, size_range_id)
      SELECT p_user_id, s FROM (SELECT DISTINCT unnest(p_size_ranges) s) x;
  END IF;
END $function$;