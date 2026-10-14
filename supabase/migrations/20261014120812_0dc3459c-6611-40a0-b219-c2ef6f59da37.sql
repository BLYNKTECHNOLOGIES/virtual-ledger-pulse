
-- UM-2A: delegated administration (R1-R6), role deletion (S6), Terminal grants (S3)

-- ── Helpers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.um_rank(p_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT MIN(r.hierarchy_level) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p_uid), 1000000)
$$;

CREATE OR REPLACE FUNCTION public.um_is_super_admin(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND public.has_role(p_uid, 'Super Admin')
$$;

-- May delegate: Super Admin, or user_management_manage on a role with can_manage_roles_below.
CREATE OR REPLACE FUNCTION public.um_can_delegate(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND (
    public.um_is_super_admin(p_uid)
    OR (public.has_permission(p_uid, 'user_management_manage'::app_permission)
        AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                    WHERE ur.user_id = p_uid AND r.can_manage_roles_below))
  )
$$;

-- Caller holds every permission on the role (effective, as has_permission).
CREATE OR REPLACE FUNCTION public.um_holds_role_perms(p_uid uuid, p_role_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                     WHERE rp.role_id = p_role_id AND NOT public.has_permission(p_uid, rp.permission))
$$;

-- R2: may create/edit/delete this role.
CREATE OR REPLACE FUNCTION public.um_can_manage_role(p_uid uuid, p_role_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND (
    public.um_is_super_admin(p_uid)
    OR (public.um_can_delegate(p_uid)
        AND COALESCE((SELECT hierarchy_level FROM public.roles WHERE id = p_role_id), -1000) > public.um_rank(p_uid))
  )
$$;

-- R3: may move p_target to p_new_role (NULL = no role).
CREATE OR REPLACE FUNCTION public.um_can_set_role(p_uid uuid, p_target uuid, p_new_role uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND p_uid <> p_target AND (
    public.um_is_super_admin(p_uid)
    OR (public.um_can_delegate(p_uid)
        AND public.um_rank(p_target) > public.um_rank(p_uid)
        AND (p_new_role IS NULL OR (public.um_can_manage_role(p_uid, p_new_role) AND public.um_holds_role_perms(p_uid, p_new_role))))
  )
$$;

-- R4: account actions: details | status | link | reset | delete | role
CREATE OR REPLACE FUNCTION public.um_can_act(p_uid uuid, p_target uuid, p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND p_target IS NOT NULL
    AND NOT (p_uid = p_target AND p_action IN ('status','delete','role','reset'))
    AND (
      public.um_is_super_admin(p_uid)
      OR (public.has_permission(p_uid, 'user_management_manage'::app_permission)
          AND public.um_rank(p_target) > public.um_rank(p_uid))
      OR (p_action IN ('details','status','link','reset')
          AND p_uid <> p_target
          AND public.has_permission(p_uid, 'user_management_hr_manage'::app_permission)
          AND public.um_rank(p_target) > 1)
    )
$$;

-- ── R3: role change step (also keeps the ERP Admin → Terminal Admin rule) ──
CREATE OR REPLACE FUNCTION public.um_set_user_role(p_user_id uuid, p_role_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role record;
  v_term_admin uuid;
  v_granted boolean := false;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF v_caller = p_user_id THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p_role_id IS NOT NULL THEN
    SELECT id, name, hierarchy_level INTO v_role FROM public.roles WHERE id = p_role_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Role not found'; END IF;
  END IF;
  IF NOT public.um_can_set_role(v_caller, p_user_id, p_role_id) THEN
    IF NOT public.um_can_delegate(v_caller) THEN
      RAISE EXCEPTION 'Your role cannot give roles to other people';
    ELSIF public.um_rank(p_user_id) <= public.um_rank(v_caller) THEN
      RAISE EXCEPTION 'This person ranks at or above you, so you cannot change their role';
    ELSIF p_role_id IS NOT NULL AND v_role.hierarchy_level <= public.um_rank(v_caller) THEN
      RAISE EXCEPTION 'You can only give roles ranked below your own';
    ELSE
      RAISE EXCEPTION 'The % role includes access you do not have, so you cannot give it', v_role.name;
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role_id IS DISTINCT FROM p_role_id;
  UPDATE public.users SET role_id = p_role_id, updated_at = now() WHERE id = p_user_id;
  IF p_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user_id, p_role_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Existing rule: a new ERP Admin without any Terminal role gets the Terminal "Admin" role.
  IF p_role_id IS NOT NULL AND lower(trim(v_role.name)) = 'admin'
     AND NOT EXISTS (SELECT 1 FROM public.p2p_terminal_user_roles WHERE user_id = p_user_id) THEN
    SELECT id INTO v_term_admin FROM public.p2p_terminal_roles WHERE lower(trim(name)) = 'admin' LIMIT 1;
    IF v_term_admin IS NOT NULL THEN
      INSERT INTO public.p2p_terminal_user_roles (user_id, role_id, assigned_by)
      VALUES (p_user_id, v_term_admin, v_caller) ON CONFLICT (user_id, role_id) DO NOTHING;
      v_granted := true;
    END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'terminal_admin_granted', v_granted);
END $$;

-- ── R4: HRMS badge link step ──
CREATE OR REPLACE FUNCTION public.um_link_hr_employee(p_user_id uuid, p_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_other uuid; v_changed boolean := false;
BEGIN
  IF NOT public.um_can_act(v_caller, p_user_id, 'link') THEN
    RAISE EXCEPTION 'You cannot change the HRMS link for this person';
  END IF;
  IF p_employee_id IS NOT NULL THEN
    SELECT user_id INTO v_other FROM public.hr_employees WHERE id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'HRMS employee not found'; END IF;
    IF v_other IS NOT NULL AND v_other <> p_user_id THEN
      RAISE EXCEPTION 'This HRMS employee is already linked to another login';
    END IF;
  END IF;
  UPDATE public.hr_employees SET user_id = NULL
   WHERE user_id = p_user_id AND id IS DISTINCT FROM p_employee_id;
  IF FOUND THEN v_changed := true; END IF;
  IF p_employee_id IS NOT NULL THEN
    UPDATE public.hr_employees SET user_id = p_user_id WHERE id = p_employee_id AND user_id IS DISTINCT FROM p_user_id;
    IF FOUND THEN v_changed := true; END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'changed', v_changed);
END $$;

-- ── users: row + column guard ──
CREATE OR REPLACE FUNCTION public.um_users_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_changed text[];
  v_details text[] := ARRAY['username','email','first_name','last_name','phone','avatar_url','updated_at','force_logout_at'];
  k text;
BEGIN
  -- Only direct client writes are checked; server functions run as their owner and do their own checks.
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  SELECT array_agg(n.key) INTO v_changed
    FROM jsonb_each(to_jsonb(NEW)) n JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
   WHERE n.value IS DISTINCT FROM o.value;
  IF v_changed IS NULL THEN RETURN NEW; END IF;
  FOREACH k IN ARRAY v_changed LOOP
    IF k = 'role_id' THEN
      IF NOT public.um_can_set_role(v_caller, NEW.id, NEW.role_id) THEN
        RAISE EXCEPTION 'You cannot give this role to this person' USING ERRCODE = '42501';
      END IF;
    ELSIF k = 'status' THEN
      IF NOT public.um_can_act(v_caller, NEW.id, 'status') THEN
        RAISE EXCEPTION 'You cannot change this person''s status' USING ERRCODE = '42501';
      END IF;
    ELSIF k = 'badge_id' THEN
      IF NOT public.um_can_act(v_caller, NEW.id, 'link') THEN
        RAISE EXCEPTION 'You cannot change this person''s badge link' USING ERRCODE = '42501';
      END IF;
    ELSIF k = ANY (v_details) THEN
      IF NOT public.um_can_act(v_caller, NEW.id, 'details') THEN
        RAISE EXCEPTION 'You cannot edit this person''s details' USING ERRCODE = '42501';
      END IF;
    ELSE
      -- Any other column needs full account rights over this person.
      IF NOT (public.um_is_super_admin(v_caller)
              OR (public.has_permission(v_caller, 'user_management_manage'::app_permission)
                  AND public.um_rank(NEW.id) > public.um_rank(v_caller))) THEN
        RAISE EXCEPTION 'You cannot change % for this person', k USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_um_users_update_guard ON public.users;
CREATE TRIGGER trg_um_users_update_guard BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.um_users_update_guard();

DROP POLICY IF EXISTS managers_update_users ON public.users;
CREATE POLICY um_update_users ON public.users FOR UPDATE TO authenticated
  USING (public.um_can_act((SELECT auth.uid()), id, 'details'))
  WITH CHECK (public.um_can_act((SELECT auth.uid()), id, 'details'));

DROP POLICY IF EXISTS managers_insert_users ON public.users;
CREATE POLICY um_insert_users ON public.users FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((SELECT auth.uid()), 'user_management_manage'::app_permission));

-- ── user_roles: same R3 rule for direct writes ──
DROP POLICY IF EXISTS managers_insert_user_roles ON public.user_roles;
DROP POLICY IF EXISTS managers_update_user_roles ON public.user_roles;
DROP POLICY IF EXISTS managers_delete_user_roles ON public.user_roles;
CREATE POLICY um_insert_user_roles ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.um_can_set_role((SELECT auth.uid()), user_id, role_id));
CREATE POLICY um_update_user_roles ON public.user_roles FOR UPDATE TO authenticated
  USING (public.um_can_set_role((SELECT auth.uid()), user_id, NULL))
  WITH CHECK (public.um_can_set_role((SELECT auth.uid()), user_id, role_id));
CREATE POLICY um_delete_user_roles ON public.user_roles FOR DELETE TO authenticated
  USING (public.um_can_set_role((SELECT auth.uid()), user_id, NULL));

-- ── R2: create / edit roles ──
CREATE OR REPLACE FUNCTION public.create_role_with_permissions(role_name text, role_description text, permissions text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  new_role_id uuid;
  v_illegal text[];
BEGIN
  IF NOT public.um_can_delegate(v_caller) THEN
    RAISE EXCEPTION 'Your role cannot create roles';
  END IF;
  IF NOT public.um_is_super_admin(v_caller) AND 100 <= public.um_rank(v_caller) THEN
    RAISE EXCEPTION 'New roles start at level 100, which is not below your own rank';
  END IF;
  SELECT array_agg(DISTINCT p) INTO v_illegal FROM unnest(COALESCE(permissions, '{}')) p
   WHERE NOT public.has_permission(v_caller, p::app_permission);
  IF v_illegal IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot give access you do not have: %', array_to_string(v_illegal, ', ');
  END IF;

  INSERT INTO roles (name, description, is_system_role) VALUES (role_name, role_description, false)
  RETURNING id INTO new_role_id;
  INSERT INTO role_permissions (role_id, permission)
  SELECT DISTINCT new_role_id, p::app_permission FROM unnest(COALESCE(permissions, '{}')) p;
  RETURN new_role_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_role_permissions(p_role_id uuid, p_role_name text, p_role_description text, p_permissions text[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role record;
  v_illegal text[];
BEGIN
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT public.um_can_manage_role(v_caller, p_role_id) THEN
    IF NOT public.um_can_delegate(v_caller) THEN
      RAISE EXCEPTION 'Your role cannot edit roles';
    END IF;
    RAISE EXCEPTION 'You can only edit roles ranked below your own';
  END IF;
  IF v_role.is_system_role AND p_role_name IS DISTINCT FROM v_role.name THEN
    RAISE EXCEPTION 'System role names cannot be changed';
  END IF;

  -- Adding: only permissions the caller holds.
  SELECT array_agg(DISTINCT p) INTO v_illegal
    FROM unnest(COALESCE(p_permissions, '{}')) p
   WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = p_role_id AND rp.permission::text = p)
     AND NOT public.has_permission(v_caller, p::app_permission);
  IF v_illegal IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot give access you do not have: %', array_to_string(v_illegal, ', ');
  END IF;

  UPDATE roles SET name = p_role_name, description = p_role_description, updated_at = now() WHERE id = p_role_id;

  -- Removing: only permissions the caller holds; others stay exactly as they are.
  DELETE FROM role_permissions rp
   WHERE rp.role_id = p_role_id
     AND NOT (rp.permission::text = ANY (COALESCE(p_permissions, '{}')))
     AND public.has_permission(v_caller, rp.permission);

  INSERT INTO role_permissions (role_id, permission)
  SELECT DISTINCT p_role_id, p::app_permission FROM unnest(COALESCE(p_permissions, '{}')) p
   WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = p_role_id AND rp.permission::text = p);
  RETURN true;
END $$;

-- ── S6: delete a role ──
CREATE OR REPLACE FUNCTION public.um_delete_role(p_role_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_role record; v_n integer;
BEGIN
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF v_role.is_system_role OR lower(trim(v_role.name)) IN ('super admin','admin') THEN
    RAISE EXCEPTION 'System roles cannot be deleted';
  END IF;
  IF NOT public.um_can_manage_role(v_caller, p_role_id) THEN
    RAISE EXCEPTION 'You can only delete roles ranked below your own';
  END IF;
  SELECT count(DISTINCT uid) INTO v_n FROM (
    SELECT id AS uid FROM public.users WHERE role_id = p_role_id
    UNION SELECT user_id FROM public.user_roles WHERE role_id = p_role_id) s;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% % still % this role. Move them to another role first.',
      v_n, CASE WHEN v_n = 1 THEN 'person' ELSE 'people' END, CASE WHEN v_n = 1 THEN 'has' ELSE 'have' END;
  END IF;
  DELETE FROM public.role_functions WHERE role_id = p_role_id;
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;
  DELETE FROM public.roles WHERE id = p_role_id;
  RETURN jsonb_build_object('success', true, 'name', v_role.name);
END $$;

-- ── role_functions: R2 for direct writes, only functions the caller has ──
CREATE OR REPLACE FUNCTION public.um_holds_function(p_uid uuid, p_function_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.um_is_super_admin(p_uid) OR EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.role_functions rf ON rf.role_id = ur.role_id
     WHERE ur.user_id = p_uid AND rf.function_id = p_function_id)
$$;

DROP POLICY IF EXISTS superadmin_write_role_functions ON public.role_functions;
DROP POLICY IF EXISTS superadmin_update_role_functions ON public.role_functions;
DROP POLICY IF EXISTS superadmin_delete_role_functions ON public.role_functions;
CREATE POLICY um_insert_role_functions ON public.role_functions FOR INSERT TO authenticated
  WITH CHECK (public.um_can_manage_role((SELECT auth.uid()), role_id) AND public.um_holds_function((SELECT auth.uid()), function_id));
CREATE POLICY um_update_role_functions ON public.role_functions FOR UPDATE TO authenticated
  USING (public.um_can_manage_role((SELECT auth.uid()), role_id) AND public.um_holds_function((SELECT auth.uid()), function_id))
  WITH CHECK (public.um_can_manage_role((SELECT auth.uid()), role_id) AND public.um_holds_function((SELECT auth.uid()), function_id));
CREATE POLICY um_delete_role_functions ON public.role_functions FOR DELETE TO authenticated
  USING (public.um_can_manage_role((SELECT auth.uid()), role_id) AND public.um_holds_function((SELECT auth.uid()), function_id));

-- ── R5: change history readable by view holders ──
DROP POLICY IF EXISTS "Authenticated users can view permission change logs" ON public.permission_change_log;
CREATE POLICY um_read_permission_change_log ON public.permission_change_log FOR SELECT TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'user_management_view'::app_permission)
      OR public.has_permission((SELECT auth.uid()), 'user_management_manage'::app_permission));

-- ── S3: Terminal grants follow the owner's model ──
CREATE OR REPLACE FUNCTION public.um_terminal_level(p_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MIN(r.hierarchy_level), 999) FROM public.p2p_terminal_user_roles tur
    JOIN public.p2p_terminal_roles r ON r.id = tur.role_id WHERE tur.user_id = p_uid
$$;

CREATE OR REPLACE FUNCTION public.um_terminal_unrestricted(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.um_is_super_admin(p_uid)
      OR public.um_terminal_level(p_uid) <= (SELECT MIN(hierarchy_level) FROM public.p2p_terminal_roles)
$$;

-- Reason text when p_uid may not give/remove p_role for p_target; NULL when allowed.
CREATE OR REPLACE FUNCTION public.um_terminal_refusal(p_uid uuid, p_target uuid, p_role_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_level int; v_role_level int; v_illegal text[];
BEGIN
  IF p_uid IS NULL THEN RETURN 'Not signed in'; END IF;
  IF p_role_id IS NULL OR NOT EXISTS (SELECT 1 FROM p2p_terminal_roles WHERE id = p_role_id) THEN
    RETURN 'Choose a Terminal role';
  END IF;
  IF public.um_terminal_unrestricted(p_uid) THEN RETURN NULL; END IF;
  IF p_uid = p_target THEN RETURN 'You cannot change your own Terminal access'; END IF;
  IF NOT public.has_terminal_permission(p_uid, 'terminal_users_role_assign'::terminal_permission) THEN
    RETURN 'You need the Terminal "assign roles" permission';
  END IF;
  v_level := public.um_terminal_level(p_uid);
  SELECT COALESCE(hierarchy_level, 999) INTO v_role_level FROM p2p_terminal_roles WHERE id = p_role_id;
  IF v_role_level <= v_level THEN
    RETURN 'You can only give or remove Terminal roles ranked below your own';
  END IF;
  IF public.um_terminal_level(p_target) <= v_level THEN
    RETURN 'This person ranks at or above you in the Terminal';
  END IF;
  SELECT array_agg(rp.permission::text) INTO v_illegal FROM p2p_terminal_role_permissions rp
   WHERE rp.role_id = p_role_id AND rp.permission NOT IN (
     SELECT rp2.permission FROM p2p_terminal_user_roles tur JOIN p2p_terminal_role_permissions rp2 ON rp2.role_id = tur.role_id
      WHERE tur.user_id = p_uid);
  IF v_illegal IS NOT NULL THEN
    RETURN 'This Terminal role includes access you do not have: ' || array_to_string(v_illegal, ', ');
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.assign_terminal_role(p_user_id uuid, p_role_id uuid, p_assigned_by uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid; v_reason text;
BEGIN
  -- The signed-in caller always counts; p_assigned_by is only used by server jobs without a session.
  v_caller := COALESCE(auth.uid(), CASE WHEN current_setting('request.jwt.claim.role', true) = 'service_role'
                                            OR auth.role() = 'service_role' THEN p_assigned_by END);
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  v_reason := public.um_terminal_refusal(v_caller, p_user_id, p_role_id);
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
  INSERT INTO p2p_terminal_user_roles (user_id, role_id, assigned_by)
  VALUES (p_user_id, p_role_id, v_caller) ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.remove_terminal_role(p_user_id uuid, p_role_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason text;
BEGIN
  v_reason := public.um_terminal_refusal(auth.uid(), p_user_id, p_role_id);
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
  DELETE FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id = p_role_id;
END $$;

-- ── R5: what the signed-in person may do (screen gating mirrors the server) ──
CREATE OR REPLACE FUNCTION public.um_my_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := auth.uid(); v_users jsonb;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_object_agg(u.id, jsonb_build_object(
      'details', public.um_can_act(v, u.id, 'details'),
      'status',  public.um_can_act(v, u.id, 'status'),
      'link',    public.um_can_act(v, u.id, 'link'),
      'reset',   public.um_can_act(v, u.id, 'reset'),
      'delete',  public.um_can_act(v, u.id, 'delete'),
      'role',    public.um_can_set_role(v, u.id, NULL),
      'terminal', public.um_terminal_unrestricted(v)
                  OR (v <> u.id AND public.has_terminal_permission(v, 'terminal_users_role_assign'::terminal_permission)
                      AND public.um_terminal_level(u.id) > public.um_terminal_level(v))
    )), '{}'::jsonb) INTO v_users
  FROM public.users u WHERE u.username NOT LIKE 'deleted_%';

  RETURN jsonb_build_object(
    'rank', public.um_rank(v),
    'is_super_admin', public.um_is_super_admin(v),
    'can_delegate', public.um_can_delegate(v),
    'can_manage_accounts', public.has_permission(v, 'user_management_manage'::app_permission),
    'can_hr_manage', public.has_permission(v, 'user_management_hr_manage'::app_permission),
    'held_permissions', (SELECT COALESCE(jsonb_agg(e::text), '[]'::jsonb) FROM unnest(enum_range(NULL::app_permission)) e
                          WHERE public.has_permission(v, e)),
    'held_function_ids', (SELECT COALESCE(jsonb_agg(f.id), '[]'::jsonb) FROM public.system_functions f WHERE public.um_holds_function(v, f.id)),
    'manageable_role_ids', (SELECT COALESCE(jsonb_agg(r.id), '[]'::jsonb) FROM public.roles r WHERE public.um_can_manage_role(v, r.id)),
    'assignable_role_ids', (SELECT COALESCE(jsonb_agg(r.id), '[]'::jsonb) FROM public.roles r
                             WHERE public.um_is_super_admin(v) OR (public.um_can_manage_role(v, r.id) AND public.um_holds_role_perms(v, r.id))),
    'terminal', jsonb_build_object(
       'unrestricted', public.um_terminal_unrestricted(v),
       'can_assign', public.um_terminal_unrestricted(v) OR public.has_terminal_permission(v, 'terminal_users_role_assign'::terminal_permission),
       'grantable_role_ids', (SELECT COALESCE(jsonb_agg(r.id), '[]'::jsonb) FROM public.p2p_terminal_roles r
                               WHERE public.um_terminal_refusal(v, '00000000-0000-0000-0000-000000000000'::uuid, r.id) IS NULL)),
    'users', v_users
  );
END $$;

-- ── Grants ──
REVOKE ALL ON FUNCTION public.um_rank(uuid), public.um_is_super_admin(uuid), public.um_can_delegate(uuid),
  public.um_holds_role_perms(uuid,uuid), public.um_can_manage_role(uuid,uuid), public.um_can_set_role(uuid,uuid,uuid),
  public.um_can_act(uuid,uuid,text), public.um_holds_function(uuid,uuid), public.um_terminal_level(uuid),
  public.um_terminal_unrestricted(uuid), public.um_terminal_refusal(uuid,uuid,uuid),
  public.um_set_user_role(uuid,uuid), public.um_link_hr_employee(uuid,uuid), public.um_delete_role(uuid),
  public.um_my_access(), public.um_users_update_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.um_rank(uuid), public.um_is_super_admin(uuid), public.um_can_delegate(uuid),
  public.um_holds_role_perms(uuid,uuid), public.um_can_manage_role(uuid,uuid), public.um_can_set_role(uuid,uuid,uuid),
  public.um_can_act(uuid,uuid,text), public.um_holds_function(uuid,uuid), public.um_terminal_level(uuid),
  public.um_terminal_unrestricted(uuid), public.um_terminal_refusal(uuid,uuid,uuid),
  public.um_set_user_role(uuid,uuid), public.um_link_hr_employee(uuid,uuid), public.um_delete_role(uuid),
  public.um_my_access() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_role_with_permissions(text,text,text[]), public.update_role_permissions(uuid,text,text,text[]),
  public.assign_terminal_role(uuid,uuid,uuid), public.remove_terminal_role(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_role_with_permissions(text,text,text[]), public.update_role_permissions(uuid,text,text,text[]),
  public.assign_terminal_role(uuid,uuid,uuid), public.remove_terminal_role(uuid,uuid) TO authenticated, service_role;
