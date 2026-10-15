-- Loop-safe downward walk of the supervisor tree the Terminal Users screen shows.
CREATE OR REPLACE FUNCTION public.terminal_mapping_subordinates(p_manager uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree(uid, depth) AS (
    SELECT m.user_id, 1 FROM public.terminal_user_supervisor_mappings m WHERE m.supervisor_id = p_manager
    UNION
    SELECT m.user_id, t.depth + 1 FROM public.terminal_user_supervisor_mappings m JOIN tree t ON m.supervisor_id = t.uid
    WHERE t.depth < 50
  )
  SELECT DISTINCT uid FROM tree WHERE uid IS NOT NULL AND uid <> p_manager;
$$;
REVOKE ALL ON FUNCTION public.terminal_mapping_subordinates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_mapping_subordinates(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.terminal_may_manage_target(p_manager uuid, p_target uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare v_perms text[];
begin
  if p_manager is null or p_target is null then return false; end if;
  -- Super Admin / Terminal admin: anyone, themselves included.
  if public.terminal_is_admin(p_manager) then return true; end if;
  -- Everyone else: never their own rows.
  if p_target = p_manager then return false; end if;
  v_perms := array(select rp.permission::text from public.p2p_terminal_user_roles ur
                   join public.p2p_terminal_role_permissions rp on rp.role_id = ur.role_id
                   where ur.user_id = p_manager);
  if 'terminal_users_manage_all' = any(v_perms) then return true; end if;
  if not (v_perms && array['terminal_users_manage','terminal_users_manage_subordinates']) then return false; end if;
  return exists (select 1 from public.terminal_mapping_subordinates(p_manager) s where s.user_id = p_target);
end $$;

-- 1. Roles, rights, assignments: read-only for signed-in users (writes via guarded RPCs).
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['p2p_terminal_roles','p2p_terminal_role_permissions','p2p_terminal_user_roles'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS terminal_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS terminal_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS terminal_delete ON public.%I', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon', t);
  END LOOP;
END $$;

-- 2. Per-user settings: manager rule, no self edits except admins.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['terminal_user_profiles','terminal_user_supervisor_mappings','terminal_user_size_range_mappings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS terminal_write ON public.%I', t);
    EXECUTE format('CREATE POLICY terminal_target_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.terminal_may_manage_target(auth.uid(), user_id))', t);
    EXECUTE format('CREATE POLICY terminal_target_update ON public.%I FOR UPDATE TO authenticated USING (public.terminal_may_manage_target(auth.uid(), user_id)) WITH CHECK (public.terminal_may_manage_target(auth.uid(), user_id))', t);
    EXECUTE format('CREATE POLICY terminal_target_delete ON public.%I FOR DELETE TO authenticated USING (public.terminal_may_manage_target(auth.uid(), user_id))', t);
  END LOOP;
END $$;

-- 5. Shared setup tables.
DROP POLICY IF EXISTS terminal_write ON public.terminal_order_size_ranges;
CREATE POLICY terminal_size_ranges_write ON public.terminal_order_size_ranges FOR ALL TO authenticated
  USING (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage'::terminal_permission))
  WITH CHECK (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage'::terminal_permission));

DROP POLICY IF EXISTS terminal_write ON public.terminal_payer_assignments;
CREATE POLICY terminal_payer_assignments_write ON public.terminal_payer_assignments FOR ALL TO authenticated
  USING (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage'::terminal_permission) OR public.has_terminal_permission(auth.uid(), 'terminal_payer_manage'::terminal_permission))
  WITH CHECK (public.terminal_is_admin(auth.uid()) OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage'::terminal_permission) OR public.has_terminal_permission(auth.uid(), 'terminal_payer_manage'::terminal_permission));

-- Screen helper: may the signed-in user edit this person's Terminal settings?
CREATE OR REPLACE FUNCTION public.terminal_can_edit_user(p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.terminal_may_manage_target(auth.uid(), p_target);
$$;
REVOKE ALL ON FUNCTION public.terminal_can_edit_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminal_can_edit_user(uuid) TO authenticated, service_role;