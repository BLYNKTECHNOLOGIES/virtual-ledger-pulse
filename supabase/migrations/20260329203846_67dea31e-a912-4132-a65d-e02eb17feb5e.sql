-- Stage 1A: Add ~33 new terminal_permission enum values
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_dashboard_export';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_orders_sync_approve';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_orders_escalate';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_orders_resolve_escalation';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_orders_chat';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_orders_export';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_ads_toggle';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_ads_rest_timer';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_pricing_view';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_pricing_manage';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_pricing_toggle';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_pricing_delete';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_autopay_view';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_autopay_toggle';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_autopay_configure';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_autoreply_view';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_autoreply_manage';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_autoreply_toggle';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_users_role_assign';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_users_bypass_code';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_users_manage_subordinates';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_users_manage_all';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_shift_view';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_shift_manage';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_shift_reconciliation';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_analytics_export';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_mpi_view_own';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_mpi_view_all';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_broadcasts_create';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_broadcasts_manage';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_activity_logs_view';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_pricing_logs_view';
ALTER TYPE terminal_permission ADD VALUE IF NOT EXISTS 'terminal_destructive';

-- Stage 1C: Create has_terminal_permission() security definer function
CREATE OR REPLACE FUNCTION public.has_terminal_permission(p_user_id UUID, p_permission terminal_permission)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM p2p_terminal_user_roles tur
    JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
    WHERE tur.user_id = p_user_id
      AND rp.permission = p_permission
  )
$$;

-- Stage 1D: Replace save_terminal_role with delegation guard + hierarchy guard
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
  v_illegal_perms TEXT[];
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller's minimum hierarchy level
  SELECT COALESCE(MIN(r.hierarchy_level), 999)
  INTO v_caller_level
  FROM p2p_terminal_user_roles tur
  JOIN p2p_terminal_roles r ON r.id = tur.role_id
  WHERE tur.user_id = v_caller_id;

  -- Super Admin (level < 0) bypasses all checks
  IF v_caller_level >= 0 THEN
    -- Check caller has terminal_users_role_assign permission
    IF NOT EXISTS (
      SELECT 1 FROM p2p_terminal_user_roles tur
      JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
      WHERE tur.user_id = v_caller_id AND rp.permission = 'terminal_users_role_assign'
    ) THEN
      RAISE EXCEPTION 'You do not have permission to manage roles (terminal_users_role_assign required)';
    END IF;

    -- Hierarchy guard: cannot create/edit roles at or above own level
    v_target_level := COALESCE(p_hierarchy_level, 999);
    IF p_role_id IS NOT NULL THEN
      SELECT hierarchy_level INTO v_target_level FROM p2p_terminal_roles WHERE id = p_role_id;
      v_target_level := COALESCE(v_target_level, 999);
    END IF;
    IF v_target_level <= v_caller_level THEN
      RAISE EXCEPTION 'Cannot edit roles at or above your hierarchy level (%)' , v_caller_level;
    END IF;

    -- Delegation guard: cannot grant permissions the caller doesn't have
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

  -- Perform the actual save
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

-- Stage 4B: Create terminal_permission_change_log table
CREATE TABLE IF NOT EXISTS public.terminal_permission_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES p2p_terminal_roles(id) ON DELETE SET NULL,
  role_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  permission TEXT NOT NULL,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_permission_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view permission change log"
ON public.terminal_permission_change_log
FOR SELECT TO authenticated USING (true);
