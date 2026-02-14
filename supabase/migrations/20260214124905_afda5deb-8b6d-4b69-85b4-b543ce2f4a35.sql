
-- =====================================================
-- Phase 2: Order Assignment & Jurisdiction System
-- =====================================================

-- 1. Order assignments table — tracks which operator handles which order
CREATE TABLE public.terminal_order_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  assigned_to uuid NOT NULL REFERENCES public.users(id),
  assigned_by uuid REFERENCES public.users(id),
  assignment_type text NOT NULL DEFAULT 'manual' CHECK (assignment_type IN ('manual', 'auto', 'reassigned')),
  exchange_account_id uuid REFERENCES public.terminal_exchange_accounts(id),
  size_range_id uuid REFERENCES public.terminal_order_size_ranges(id),
  is_active boolean NOT NULL DEFAULT true,
  trade_type text, -- BUY or SELL
  total_price numeric DEFAULT 0,
  asset text DEFAULT 'USDT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_number, is_active) -- only one active assignment per order
);

ALTER TABLE public.terminal_order_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terminal order assignments readable"
  ON public.terminal_order_assignments FOR SELECT USING (true);

CREATE POLICY "Terminal order assignments manageable"
  ON public.terminal_order_assignments FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_terminal_order_assignments_updated_at
  BEFORE UPDATE ON public.terminal_order_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_terminal_updated_at();

-- 2. RPC: Get all user IDs visible to a given user (self + all subordinates)
-- Admin (hierarchy_level=0) sees everything, others see their subtree
CREATE OR REPLACE FUNCTION public.get_terminal_visible_user_ids(p_user_id uuid)
RETURNS TABLE(visible_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_hierarchy_level integer;
BEGIN
  -- Check if user is admin (level 0)
  SELECT EXISTS(
    SELECT 1 FROM p2p_terminal_user_roles tur
    JOIN p2p_terminal_roles tr ON tr.id = tur.role_id
    WHERE tur.user_id = p_user_id AND tr.hierarchy_level = 0
  ) INTO v_is_admin;

  IF v_is_admin THEN
    -- Admin sees all terminal users
    RETURN QUERY
    SELECT DISTINCT tur.user_id
    FROM p2p_terminal_user_roles tur;
    RETURN;
  END IF;

  -- Return self
  RETURN QUERY SELECT p_user_id;

  -- Return all subordinates recursively
  RETURN QUERY
  SELECT sub.user_id FROM get_terminal_subordinates(p_user_id) sub;
END;
$$;

-- 3. RPC: Assign an order to an operator
CREATE OR REPLACE FUNCTION public.assign_terminal_order(
  p_order_number text,
  p_assigned_to uuid,
  p_assigned_by uuid,
  p_assignment_type text DEFAULT 'manual',
  p_trade_type text DEFAULT NULL,
  p_total_price numeric DEFAULT 0,
  p_asset text DEFAULT 'USDT'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_old_assignee uuid;
BEGIN
  -- Deactivate any existing active assignment
  SELECT assigned_to INTO v_old_assignee
  FROM terminal_order_assignments
  WHERE order_number = p_order_number AND is_active = true;

  IF v_old_assignee IS NOT NULL THEN
    UPDATE terminal_order_assignments
    SET is_active = false, updated_at = now()
    WHERE order_number = p_order_number AND is_active = true;
  END IF;

  -- Create new assignment
  INSERT INTO terminal_order_assignments (
    order_number, assigned_to, assigned_by, assignment_type,
    trade_type, total_price, asset
  ) VALUES (
    p_order_number, p_assigned_to, p_assigned_by, p_assignment_type,
    p_trade_type, p_total_price, p_asset
  ) RETURNING id INTO v_id;

  -- Log to audit
  INSERT INTO terminal_assignment_audit_logs (
    action_type, target_user_id, performed_by,
    previous_value, new_value, order_reference
  ) VALUES (
    CASE WHEN v_old_assignee IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
    p_assigned_to,
    p_assigned_by,
    CASE WHEN v_old_assignee IS NOT NULL THEN jsonb_build_object('assignee', v_old_assignee) ELSE NULL END,
    jsonb_build_object('assignee', p_assigned_to, 'type', p_assignment_type),
    p_order_number
  );

  RETURN v_id;
END;
$$;

-- 4. RPC: Unassign an order
CREATE OR REPLACE FUNCTION public.unassign_terminal_order(
  p_order_number text,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_assignee uuid;
BEGIN
  SELECT assigned_to INTO v_old_assignee
  FROM terminal_order_assignments
  WHERE order_number = p_order_number AND is_active = true;

  IF v_old_assignee IS NULL THEN
    RETURN;
  END IF;

  UPDATE terminal_order_assignments
  SET is_active = false, updated_at = now()
  WHERE order_number = p_order_number AND is_active = true;

  INSERT INTO terminal_assignment_audit_logs (
    action_type, target_user_id, performed_by,
    previous_value, order_reference
  ) VALUES (
    'unassigned',
    v_old_assignee,
    p_performed_by,
    jsonb_build_object('assignee', v_old_assignee),
    p_order_number
  );
END;
$$;

-- 5. RPC: Get operator workload counts (for least-workload assignment)
CREATE OR REPLACE FUNCTION public.get_terminal_operator_workloads()
RETURNS TABLE(user_id uuid, active_order_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT assigned_to AS user_id, COUNT(*) AS active_order_count
  FROM terminal_order_assignments
  WHERE is_active = true
  GROUP BY assigned_to;
$$;
