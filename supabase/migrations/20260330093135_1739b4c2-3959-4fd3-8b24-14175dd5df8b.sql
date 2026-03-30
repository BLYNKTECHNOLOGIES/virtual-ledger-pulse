
-- 1. Fix has_terminal_access to recognize ERP Super Admins
CREATE OR REPLACE FUNCTION public.has_terminal_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM p2p_terminal_user_roles WHERE user_id = p_user_id)
      OR public.has_role(p_user_id, 'Super Admin');
$$;

-- 2. Fix has_terminal_permission to recognize ERP Super Admins (they have all perms)
CREATE OR REPLACE FUNCTION public.has_terminal_permission(p_user_id uuid, p_permission terminal_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'Super Admin')
      OR EXISTS (
           SELECT 1
           FROM p2p_terminal_user_roles tur
           JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
           WHERE tur.user_id = p_user_id
             AND rp.permission = p_permission
         );
$$;

-- 3. Fix verify_terminal_access (same issue + missing search_path)
CREATE OR REPLACE FUNCTION public.verify_terminal_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.p2p_terminal_user_roles WHERE user_id = p_user_id)
      OR public.has_role(p_user_id, 'Super Admin');
END;
$$;

-- 4. Fix get_terminal_permissions to return all perms for ERP Super Admins
CREATE OR REPLACE FUNCTION public.get_terminal_permissions(p_user_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ERP Super Admin OR terminal admin (hierarchy <= 0) get ALL permissions
  IF public.has_role(p_user_id, 'Super Admin') OR EXISTS (
    SELECT 1 FROM p2p_terminal_user_roles ur
    JOIN p2p_terminal_roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND r.hierarchy_level <= 0
  ) THEN
    RETURN QUERY SELECT e.enumlabel::text FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'terminal_permission';
    RETURN;
  END IF;

  -- Normal permission lookup
  RETURN QUERY
  SELECT DISTINCT rp.permission::TEXT
  FROM p2p_terminal_user_roles ur
  JOIN p2p_terminal_role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = p_user_id;
END;
$$;

-- 5. Fix get_terminal_visible_user_ids to recognize ERP Super Admins
CREATE OR REPLACE FUNCTION public.get_terminal_visible_user_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  -- Check ERP Super Admin OR terminal admin
  SELECT public.has_role(p_user_id, 'Super Admin') OR EXISTS(
    SELECT 1 FROM p2p_terminal_user_roles tur
    JOIN p2p_terminal_roles tr ON tr.id = tur.role_id
    WHERE tur.user_id = p_user_id AND tr.hierarchy_level <= 0
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN QUERY SELECT DISTINCT tur.user_id FROM p2p_terminal_user_roles tur;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_user_id;
  RETURN QUERY SELECT sub.user_id FROM get_terminal_subordinates(p_user_id) sub;
END;
$$;

-- 6. Add permission guard to assign_terminal_role
CREATE OR REPLACE FUNCTION public.assign_terminal_role(p_user_id uuid, p_role_id uuid, p_assigned_by uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := COALESCE(p_assigned_by, auth.uid());
  
  -- Permission check: caller must be ERP Super Admin, terminal admin, or have role_assign permission
  IF NOT public.has_role(v_caller, 'Super Admin') 
     AND NOT EXISTS (
       SELECT 1 FROM p2p_terminal_user_roles tur
       JOIN p2p_terminal_roles r ON r.id = tur.role_id
       WHERE tur.user_id = v_caller AND r.hierarchy_level <= 0
     )
     AND NOT public.has_terminal_permission(v_caller, 'terminal_users_role_assign') THEN
    RAISE EXCEPTION 'Permission denied: terminal_users_role_assign required';
  END IF;

  INSERT INTO p2p_terminal_user_roles (user_id, role_id, assigned_by)
  VALUES (p_user_id, p_role_id, v_caller)
  ON CONFLICT (user_id, role_id) DO NOTHING;
END;
$$;

-- 7. Add permission guard to remove_terminal_role
CREATE OR REPLACE FUNCTION public.remove_terminal_role(p_user_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  
  -- Permission check
  IF NOT public.has_role(v_caller, 'Super Admin')
     AND NOT EXISTS (
       SELECT 1 FROM p2p_terminal_user_roles tur
       JOIN p2p_terminal_roles r ON r.id = tur.role_id
       WHERE tur.user_id = v_caller AND r.hierarchy_level <= 0
     )
     AND NOT public.has_terminal_permission(v_caller, 'terminal_users_role_assign') THEN
    RAISE EXCEPTION 'Permission denied: terminal_users_role_assign required';
  END IF;

  DELETE FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id = p_role_id;
END;
$$;

-- 8. Add permission guard to generate_terminal_bypass_code
CREATE OR REPLACE FUNCTION public.generate_terminal_bypass_code(p_user_id uuid, p_generated_by uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_recent_count integer;
BEGIN
  -- Permission check: caller must have bypass_code permission, be terminal admin, or ERP Super Admin
  IF NOT public.has_role(p_generated_by, 'Super Admin')
     AND NOT EXISTS (
       SELECT 1 FROM p2p_terminal_user_roles tur
       JOIN p2p_terminal_roles r ON r.id = tur.role_id
       WHERE tur.user_id = p_generated_by AND r.hierarchy_level <= 0
     )
     AND NOT public.has_terminal_permission(p_generated_by, 'terminal_users_bypass_code') THEN
    RAISE EXCEPTION 'Permission denied: terminal_users_bypass_code required';
  END IF;

  -- Rate limit: max 3 codes per user in 15 minutes
  SELECT COUNT(*) INTO v_recent_count
  FROM terminal_bypass_codes
  WHERE user_id = p_user_id AND created_at > now() - interval '15 minutes';

  IF v_recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 bypass codes per 15 minutes.';
  END IF;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  
  UPDATE public.terminal_bypass_codes
  SET is_used = true
  WHERE user_id = p_user_id AND is_used = false;
  
  INSERT INTO public.terminal_bypass_codes (user_id, code, generated_by)
  VALUES (p_user_id, v_code, p_generated_by);

  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_generated_by, 'bypass_code_generated', jsonb_build_object('target_user_id', p_user_id));
  
  RETURN v_code;
END;
$$;
