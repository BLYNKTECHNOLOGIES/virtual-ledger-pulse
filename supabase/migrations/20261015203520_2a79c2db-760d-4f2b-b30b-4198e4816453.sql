-- AM-SEC-7b
-- 1) Rank rule for managing a person's Terminal settings
CREATE OR REPLACE FUNCTION public.terminal_may_manage_target(p_manager uuid, p_target uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_perms text[]; v_lm int; v_lt int; v_target_sa boolean;
begin
  if p_manager is null or p_target is null then return false; end if;
  v_lm := public.um_terminal_level(p_manager);
  -- Super Admin: everyone, own rows included.
  if public.um_is_super_admin(p_manager) or v_lm < 0 then return true; end if;
  v_lt := public.um_terminal_level(p_target);
  v_target_sa := public.um_is_super_admin(p_target) or v_lt < 0;
  -- Terminal admins: everyone except the Super Admin, own rows included.
  if public.terminal_is_admin(p_manager) then return not v_target_sa; end if;
  -- Everyone else: never own rows, only people ranked strictly below.
  if p_target = p_manager or v_target_sa or v_lt <= v_lm then return false; end if;
  v_perms := array(select rp.permission::text from public.p2p_terminal_user_roles ur
                   join public.p2p_terminal_role_permissions rp on rp.role_id = ur.role_id
                   where ur.user_id = p_manager);
  if 'terminal_users_manage_all' = any(v_perms) then return true; end if;
  if not (v_perms && array['terminal_users_manage','terminal_users_manage_subordinates']) then return false; end if;
  return exists (select 1 from public.terminal_mapping_subordinates(p_manager) s where s.user_id = p_target);
end $function$;

-- 2) Supervisor rows: supervisor must be self or someone the editor may manage; no loops
DROP POLICY IF EXISTS terminal_target_insert ON public.terminal_user_supervisor_mappings;
DROP POLICY IF EXISTS terminal_target_update ON public.terminal_user_supervisor_mappings;
CREATE POLICY terminal_target_insert ON public.terminal_user_supervisor_mappings FOR INSERT TO authenticated
  WITH CHECK (public.terminal_may_manage_target(auth.uid(), user_id) AND supervisor_id <> user_id
    AND (public.terminal_is_admin(auth.uid()) OR supervisor_id = auth.uid() OR public.terminal_may_manage_target(auth.uid(), supervisor_id)));
CREATE POLICY terminal_target_update ON public.terminal_user_supervisor_mappings FOR UPDATE TO authenticated
  USING (public.terminal_may_manage_target(auth.uid(), user_id))
  WITH CHECK (public.terminal_may_manage_target(auth.uid(), user_id) AND supervisor_id <> user_id
    AND (public.terminal_is_admin(auth.uid()) OR supervisor_id = auth.uid() OR public.terminal_may_manage_target(auth.uid(), supervisor_id)));

CREATE OR REPLACE FUNCTION public.terminal_supervisor_no_loop()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if new.supervisor_id is null then return new; end if;
  if new.supervisor_id = new.user_id
     or exists (select 1 from public.terminal_mapping_subordinates(new.user_id) s where s.user_id = new.supervisor_id) then
    raise exception 'This would make the person their own supervisor (directly or through the team tree)';
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_terminal_supervisor_no_loop ON public.terminal_user_supervisor_mappings;
CREATE TRIGGER trg_terminal_supervisor_no_loop BEFORE INSERT OR UPDATE ON public.terminal_user_supervisor_mappings
  FOR EACH ROW EXECUTE FUNCTION public.terminal_supervisor_no_loop();

-- 4) "Rights you hold" = effective rights (admins hold every right); rank part unchanged
CREATE OR REPLACE FUNCTION public.um_terminal_refusal(p_uid uuid, p_target uuid, p_role_id uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_level int; v_role_level int; v_illegal text[];
BEGIN
  IF p_uid IS NULL THEN RETURN 'Not signed in'; END IF;
  IF p_role_id IS NULL OR NOT EXISTS (SELECT 1 FROM p2p_terminal_roles WHERE id = p_role_id) THEN
    RETURN 'Choose a Terminal role';
  END IF;
  IF public.um_terminal_unrestricted(p_uid) THEN RETURN NULL; END IF;
  IF p_uid = p_target THEN RETURN 'You cannot change your own Terminal access'; END IF;
  IF NOT public.has_terminal_permission(p_uid, 'terminal_users_role_assign'::terminal_permission)
     AND NOT public.terminal_is_admin(p_uid) THEN
    RETURN 'You need the Terminal "assign roles" permission';
  END IF;
  v_level := public.um_terminal_level(p_uid);
  SELECT COALESCE(hierarchy_level, 999) INTO v_role_level FROM p2p_terminal_roles WHERE id = p_role_id;
  IF v_role_level <= v_level THEN
    RETURN 'You can only give or remove Terminal roles ranked below your own';
  END IF;
  IF public.um_is_super_admin(p_target) OR public.um_terminal_level(p_target) <= v_level THEN
    RETURN 'This person ranks at or above you in the Terminal';
  END IF;
  SELECT array_agg(rp.permission::text) INTO v_illegal FROM p2p_terminal_role_permissions rp
   WHERE rp.role_id = p_role_id
     AND rp.permission::text NOT IN (SELECT public.get_terminal_permissions(p_uid));
  IF v_illegal IS NOT NULL THEN
    RETURN 'This Terminal role includes access you do not have: ' || array_to_string(v_illegal, ', ');
  END IF;
  RETURN NULL;
END $function$;

-- 3) All-or-nothing saves
CREATE OR REPLACE FUNCTION public.terminal_assignable_roles(p_target uuid)
 RETURNS TABLE(role_id uuid, name text, hierarchy_level integer, refusal text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.id, r.name::text, r.hierarchy_level,
         CASE WHEN NOT public.terminal_may_manage_target(auth.uid(), p_target)
              THEN 'You can only change Terminal settings for people you manage.'
              ELSE public.um_terminal_refusal(auth.uid(), p_target, r.id) END
  FROM public.p2p_terminal_roles r
  ORDER BY r.hierarchy_level NULLS LAST, r.name;
$$;

CREATE OR REPLACE FUNCTION public.terminal_save_user_config(
  p_user_id uuid, p_profile jsonb, p_role_id uuid,
  p_supervisors uuid[], p_accounts uuid[], p_size_ranges uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $$
DECLARE v uuid := auth.uid(); r record; v_reason text;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.terminal_may_manage_target(v, p_user_id) THEN
    IF v = p_user_id THEN RAISE EXCEPTION 'Only Super Admin or a Terminal admin can change their own Terminal settings.'; END IF;
    RAISE EXCEPTION 'You can only change Terminal settings for people you manage.';
  END IF;

  -- Role change: check every step first; any refusal changes nothing.
  IF p_role_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id <> p_role_id
       UNION ALL SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id = p_role_id)) THEN
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
    DELETE FROM terminal_user_supervisor_mappings WHERE user_id = p_user_id;
    INSERT INTO terminal_user_supervisor_mappings (user_id, supervisor_id)
      SELECT p_user_id, s FROM (SELECT DISTINCT unnest(p_supervisors) s) x;
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
END $$;

CREATE OR REPLACE FUNCTION public.terminal_set_supervisors(p_user_id uuid, p_supervisors uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.terminal_save_user_config(p_user_id, NULL, NULL, COALESCE(p_supervisors, '{}'), NULL, NULL);
END $$;

REVOKE ALL ON FUNCTION public.terminal_assignable_roles(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terminal_save_user_config(uuid, jsonb, uuid, uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terminal_set_supervisors(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terminal_supervisor_no_loop() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_assignable_roles(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_save_user_config(uuid, jsonb, uuid, uuid[], uuid[], uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_set_supervisors(uuid, uuid[]) TO authenticated, service_role;

-- 5) Operator + payer assignments: terminal_users_manage or admin; server stamps assigned_by
DROP POLICY IF EXISTS terminal_write ON public.terminal_operator_assignments;
DROP POLICY IF EXISTS terminal_payer_assignments_write ON public.terminal_payer_assignments;
DO $$ DECLARE t text; c text; BEGIN
  FOREACH t IN ARRAY array['terminal_operator_assignments','terminal_payer_assignments'] LOOP
    EXECUTE format('CREATE POLICY users_manage_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), %L::terminal_permission))', t, 'terminal_users_manage');
    EXECUTE format('CREATE POLICY users_manage_update ON public.%I FOR UPDATE TO authenticated USING (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), %L::terminal_permission)) WITH CHECK (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), %L::terminal_permission))', t, 'terminal_users_manage', 'terminal_users_manage');
    EXECUTE format('CREATE POLICY users_manage_delete ON public.%I FOR DELETE TO authenticated USING (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), %L::terminal_permission))', t, 'terminal_users_manage');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.terminal_stamp_assigned_by()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.assigned_by := auth.uid();
    elsif new.assigned_by is distinct from old.assigned_by then new.assigned_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_stamp_assigned_by ON public.terminal_operator_assignments;
DROP TRIGGER IF EXISTS trg_stamp_assigned_by ON public.terminal_payer_assignments;
CREATE TRIGGER trg_stamp_assigned_by BEFORE INSERT OR UPDATE ON public.terminal_operator_assignments FOR EACH ROW EXECUTE FUNCTION public.terminal_stamp_assigned_by();
CREATE TRIGGER trg_stamp_assigned_by BEFORE INSERT OR UPDATE ON public.terminal_payer_assignments FOR EACH ROW EXECUTE FUNCTION public.terminal_stamp_assigned_by();