
-- Function to auto-assign an order to the best-matched operator based on scope
CREATE OR REPLACE FUNCTION public.auto_assign_order_by_scope(
  p_order_number text,
  p_trade_type text,
  p_total_price numeric,
  p_asset text DEFAULT 'USDT',
  p_adv_no text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_matched_operator_id uuid;
  v_match_type text;
  v_assignment_id uuid;
BEGIN
  -- Skip if already assigned
  IF EXISTS (
    SELECT 1 FROM terminal_order_assignments
    WHERE order_number = p_order_number AND is_active = true
  ) THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

  -- Priority 1: Match by Ad ID (least workload)
  IF p_adv_no IS NOT NULL THEN
    SELECT oa.operator_user_id INTO v_matched_operator_id
    FROM terminal_operator_assignments oa
    JOIN terminal_user_profiles tup ON tup.user_id = oa.operator_user_id AND tup.is_active = true
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments
      WHERE is_active = true
      GROUP BY assigned_to
    ) workload ON workload.assigned_to = oa.operator_user_id
    WHERE oa.assignment_type = 'ad_id'
      AND oa.ad_id = p_adv_no
      AND oa.is_active = true
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'ad_id';
    END IF;
  END IF;

  -- Priority 2: Match by size range (least workload)
  IF v_matched_operator_id IS NULL THEN
    SELECT oa.operator_user_id INTO v_matched_operator_id
    FROM terminal_operator_assignments oa
    JOIN terminal_order_size_ranges osr ON osr.id = oa.size_range_id AND osr.is_active = true
    JOIN terminal_user_profiles tup ON tup.user_id = oa.operator_user_id AND tup.is_active = true
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments
      WHERE is_active = true
      GROUP BY assigned_to
    ) workload ON workload.assigned_to = oa.operator_user_id
    WHERE oa.assignment_type = 'size_range'
      AND oa.is_active = true
      AND p_total_price >= osr.min_amount
      AND (osr.max_amount IS NULL OR p_total_price <= osr.max_amount)
      AND (osr.order_type IS NULL OR osr.order_type = p_trade_type)
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'size_range';
    END IF;
  END IF;

  IF v_matched_operator_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_match');
  END IF;

  v_assignment_id := assign_terminal_order(
    p_order_number := p_order_number,
    p_assigned_to := v_matched_operator_id,
    p_assigned_by := v_matched_operator_id,
    p_assignment_type := 'auto_scope',
    p_trade_type := p_trade_type,
    p_total_price := p_total_price,
    p_asset := p_asset
  );

  RETURN jsonb_build_object(
    'status', 'assigned',
    'operator_id', v_matched_operator_id,
    'match_type', v_match_type,
    'assignment_id', v_assignment_id
  );
END;
$$;
