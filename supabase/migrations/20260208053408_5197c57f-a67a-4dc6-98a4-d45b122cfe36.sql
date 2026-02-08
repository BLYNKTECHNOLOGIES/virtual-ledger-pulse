
-- Terminal-specific permission enum
CREATE TYPE public.terminal_permission AS ENUM (
  'terminal_dashboard_view',
  'terminal_ads_view',
  'terminal_ads_manage',
  'terminal_orders_view',
  'terminal_orders_manage',
  'terminal_orders_actions',
  'terminal_automation_view',
  'terminal_automation_manage',
  'terminal_analytics_view',
  'terminal_settings_view',
  'terminal_settings_manage',
  'terminal_users_view',
  'terminal_users_manage'
);

-- Terminal roles table
CREATE TABLE public.p2p_terminal_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.p2p_terminal_roles ENABLE ROW LEVEL SECURITY;

-- Terminal role permissions (many-to-many)
CREATE TABLE public.p2p_terminal_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.p2p_terminal_roles(id) ON DELETE CASCADE,
  permission terminal_permission NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission)
);

ALTER TABLE public.p2p_terminal_role_permissions ENABLE ROW LEVEL SECURITY;

-- Terminal user-role mapping (links parent user to terminal role)
CREATE TABLE public.p2p_terminal_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.p2p_terminal_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES public.users(id),
  UNIQUE(user_id, role_id)
);

ALTER TABLE public.p2p_terminal_user_roles ENABLE ROW LEVEL SECURITY;

-- RPC: Get terminal permissions for a user (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_terminal_permissions(p_user_id UUID)
RETURNS TABLE(permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT rp.permission::TEXT
  FROM p2p_terminal_user_roles ur
  JOIN p2p_terminal_role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = p_user_id;
$$;

-- RPC: Get terminal roles for a user
CREATE OR REPLACE FUNCTION public.get_terminal_user_roles(p_user_id UUID)
RETURNS TABLE(role_id UUID, role_name TEXT, role_description TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.name, r.description
  FROM p2p_terminal_user_roles ur
  JOIN p2p_terminal_roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id;
$$;

-- RPC: List all terminal roles with their permissions
CREATE OR REPLACE FUNCTION public.list_terminal_roles()
RETURNS TABLE(id UUID, name TEXT, description TEXT, is_default BOOLEAN, permissions TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.name, r.description, r.is_default,
    COALESCE(ARRAY_AGG(rp.permission::TEXT) FILTER (WHERE rp.permission IS NOT NULL), '{}')
  FROM p2p_terminal_roles r
  LEFT JOIN p2p_terminal_role_permissions rp ON rp.role_id = r.id
  GROUP BY r.id, r.name, r.description, r.is_default
  ORDER BY r.name;
$$;

-- RPC: Assign terminal role to a user
CREATE OR REPLACE FUNCTION public.assign_terminal_role(p_user_id UUID, p_role_id UUID, p_assigned_by UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO p2p_terminal_user_roles (user_id, role_id, assigned_by)
  VALUES (p_user_id, p_role_id, p_assigned_by)
  ON CONFLICT (user_id, role_id) DO NOTHING;
END;
$$;

-- RPC: Remove terminal role from a user
CREATE OR REPLACE FUNCTION public.remove_terminal_role(p_user_id UUID, p_role_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM p2p_terminal_user_roles WHERE user_id = p_user_id AND role_id = p_role_id;
END;
$$;

-- RPC: Save terminal role with permissions
CREATE OR REPLACE FUNCTION public.save_terminal_role(
  p_role_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_permissions TEXT[] DEFAULT '{}'
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
    UPDATE p2p_terminal_roles SET name = p_name, description = p_description, updated_at = now()
    WHERE id = p_role_id;
    v_role_id := p_role_id;
    DELETE FROM p2p_terminal_role_permissions WHERE role_id = v_role_id;
  ELSE
    INSERT INTO p2p_terminal_roles (name, description) VALUES (p_name, p_description) RETURNING id INTO v_role_id;
  END IF;

  INSERT INTO p2p_terminal_role_permissions (role_id, permission)
  SELECT v_role_id, unnest(p_permissions)::terminal_permission;

  RETURN v_role_id;
END;
$$;

-- Seed default roles
DO $$
DECLARE
  v_admin_id UUID;
  v_operator_id UUID;
  v_viewer_id UUID;
BEGIN
  INSERT INTO p2p_terminal_roles (name, description) VALUES ('Admin', 'Full terminal access') RETURNING id INTO v_admin_id;
  INSERT INTO p2p_terminal_roles (name, description) VALUES ('Operator', 'Can manage ads, orders, and automation') RETURNING id INTO v_operator_id;
  INSERT INTO p2p_terminal_roles (name, description, is_default) VALUES ('Viewer', 'Read-only access', true) RETURNING id INTO v_viewer_id;

  -- Admin: all permissions
  INSERT INTO p2p_terminal_role_permissions (role_id, permission)
  SELECT v_admin_id, unnest(enum_range(NULL::terminal_permission));

  -- Operator: view + manage ads/orders/automation, no settings/user management
  INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
    (v_operator_id, 'terminal_dashboard_view'),
    (v_operator_id, 'terminal_ads_view'),
    (v_operator_id, 'terminal_ads_manage'),
    (v_operator_id, 'terminal_orders_view'),
    (v_operator_id, 'terminal_orders_manage'),
    (v_operator_id, 'terminal_orders_actions'),
    (v_operator_id, 'terminal_automation_view'),
    (v_operator_id, 'terminal_automation_manage'),
    (v_operator_id, 'terminal_analytics_view');

  -- Viewer: view-only
  INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
    (v_viewer_id, 'terminal_dashboard_view'),
    (v_viewer_id, 'terminal_ads_view'),
    (v_viewer_id, 'terminal_orders_view'),
    (v_viewer_id, 'terminal_analytics_view');
END $$;
