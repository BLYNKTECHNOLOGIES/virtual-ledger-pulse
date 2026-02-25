
DROP FUNCTION IF EXISTS public.list_terminal_roles();

CREATE OR REPLACE FUNCTION public.list_terminal_roles()
RETURNS TABLE(id UUID, name TEXT, description TEXT, is_default BOOLEAN, hierarchy_level INTEGER, permissions TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.name, r.description, r.is_default, r.hierarchy_level,
    COALESCE(ARRAY_AGG(rp.permission::TEXT) FILTER (WHERE rp.permission IS NOT NULL), '{}')
  FROM p2p_terminal_roles r
  LEFT JOIN p2p_terminal_role_permissions rp ON rp.role_id = r.id
  GROUP BY r.id, r.name, r.description, r.is_default, r.hierarchy_level
  ORDER BY COALESCE(r.hierarchy_level, 999), r.name;
$$;

DROP FUNCTION IF EXISTS public.save_terminal_role(UUID, TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.save_terminal_role(
  p_role_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_permissions TEXT[] DEFAULT '{}',
  p_hierarchy_level INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id UUID;
BEGIN
  IF p_role_id IS NOT NULL THEN
    UPDATE p2p_terminal_roles SET name = p_name, description = p_description, hierarchy_level = COALESCE(p_hierarchy_level, hierarchy_level), updated_at = now()
    WHERE id = p_role_id;
    v_role_id := p_role_id;
    DELETE FROM p2p_terminal_role_permissions WHERE role_id = v_role_id;
  ELSE
    INSERT INTO p2p_terminal_roles (name, description, hierarchy_level) VALUES (p_name, p_description, p_hierarchy_level) RETURNING id INTO v_role_id;
  END IF;

  INSERT INTO p2p_terminal_role_permissions (role_id, permission)
  SELECT v_role_id, unnest(p_permissions)::terminal_permission;

  RETURN v_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_min_hierarchy_level(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MIN(r.hierarchy_level), 999)
  FROM p2p_terminal_user_roles ur
  JOIN p2p_terminal_roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id;
$$;
