-- Fix BUG 1: Change delegation guard bypass from >= 0 to > 0 (Admin level 0 now bypasses, matching get_terminal_permissions)
-- Fix BUG 3: Add hierarchy escalation guard for the NEW hierarchy level

CREATE OR REPLACE FUNCTION public.save_terminal_role(
  p_role_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_permissions TEXT[] DEFAULT '{}',
  p_hierarchy_level INT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id UUID;
  v_caller_id UUID;
  v_caller_level INT;
  v_caller_perms TEXT[];
  v_target_level INT;
  v_new_level INT;
  v_illegal_perms TEXT[];
  v_is_erp_super_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.has_role(v_caller_id, 'Super Admin') INTO v_is_erp_super_admin;

  SELECT COALESCE(MIN(r.hierarchy_level), 999)
  INTO v_caller_level
  FROM p2p_terminal_user_roles tur
  JOIN p2p_terminal_roles r ON r.id = tur.role_id
  WHERE tur.user_id = v_caller_id;

  -- Admin (terminal level <= 0) OR ERP Super Admin bypasses all checks
  IF v_caller_level > 0 AND NOT v_is_erp_super_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM p2p_terminal_user_roles tur
      JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
      WHERE tur.user_id = v_caller_id AND rp.permission = 'terminal_users_role_assign'
    ) THEN
      RAISE EXCEPTION 'You do not have permission to manage roles (terminal_users_role_assign required)';
    END IF;

    -- Hierarchy guard: check CURRENT role level
    v_target_level := COALESCE(p_hierarchy_level, 999);
    IF p_role_id IS NOT NULL THEN
      SELECT hierarchy_level INTO v_target_level FROM p2p_terminal_roles WHERE id = p_role_id;
      v_target_level := COALESCE(v_target_level, 999);
    END IF;
    IF v_target_level <= v_caller_level THEN
      RAISE EXCEPTION 'Cannot edit roles at or above your hierarchy level (%)' , v_caller_level;
    END IF;

    -- Hierarchy escalation guard: prevent setting NEW level above caller
    v_new_level := COALESCE(p_hierarchy_level, v_target_level);
    IF v_new_level <= v_caller_level THEN
      RAISE EXCEPTION 'Cannot set a role hierarchy level at or above your own level (%)' , v_caller_level;
    END IF;

    -- Delegation guard
    SELECT array_agg(DISTINCT rp.permission::text)
    INTO v_caller_perms
    FROM p2p_terminal_user_roles tur
    JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
    WHERE tur.user_id = v_caller_id;

    SELECT array_agg(p)
    INTO v_illegal_perms
    FROM unnest(p_permissions) p
    WHERE p NOT IN (SELECT unnest(COALESCE(v_caller_perms, '{}')));

    IF v_illegal_perms IS NOT NULL AND array_length(v_illegal_perms, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot grant permissions you do not have: %', array_to_string(v_illegal_perms, ', ');
    END IF;
  END IF;

  IF p_role_id IS NOT NULL THEN
    UPDATE p2p_terminal_roles
    SET name = p_name, description = p_description,
        hierarchy_level = COALESCE(p_hierarchy_level, hierarchy_level),
        updated_at = now()
    WHERE id = p_role_id;
    v_role_id := p_role_id;
    DELETE FROM p2p_terminal_role_permissions WHERE role_id = v_role_id;
  ELSE
    INSERT INTO p2p_terminal_roles (name, description, hierarchy_level)
    VALUES (p_name, p_description, p_hierarchy_level)
    RETURNING id INTO v_role_id;
  END IF;

  INSERT INTO p2p_terminal_role_permissions (role_id, permission)
  SELECT v_role_id, unnest(p_permissions)::terminal_permission;

  RETURN v_role_id;
END;
$$;