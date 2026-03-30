-- W28: Fix IST timezone attribution in generate_terminal_mpi_snapshots
-- Replace created_at::date (UTC) with AT TIME ZONE 'Asia/Kolkata' for correct IST date attribution

CREATE OR REPLACE FUNCTION generate_terminal_mpi_snapshots(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_count integer := 0;
  v_orders_handled integer;
  v_orders_completed integer;
  v_orders_cancelled integer;
  v_total_volume numeric;
  v_avg_time numeric;
  v_buy_count integer;
  v_sell_count integer;
  v_completion_rate numeric;
  v_avg_response numeric;
  v_avg_size numeric;
  v_mpi numeric;
BEGIN
  FOR v_user IN
    SELECT user_id FROM terminal_user_profiles WHERE is_active = true
  LOOP
    SELECT COUNT(*) INTO v_orders_handled
    FROM terminal_order_assignments
    WHERE assigned_to = v_user.user_id
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date;

    SELECT
      COUNT(*) FILTER (WHERE por.order_status = 'COMPLETED'),
      COUNT(*) FILTER (WHERE por.order_status IN ('CANCELLED', 'CANCELLED_BY_SYSTEM')),
      COALESCE(SUM(CASE WHEN por.order_status = 'COMPLETED' THEN por.total_price::numeric ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE por.trade_type = 'BUY'),
      COUNT(*) FILTER (WHERE por.trade_type = 'SELL'),
      COALESCE(AVG(CASE
        WHEN por.order_status = 'COMPLETED' AND por.completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (por.completed_at - por.created_at)) / 60.0
        ELSE NULL
      END), 0),
      COALESCE(AVG(CASE
        WHEN toa.first_action_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (toa.first_action_at - toa.created_at)) / 60.0
        ELSE NULL
      END), 0),
      COALESCE(AVG(CASE WHEN por.order_status = 'COMPLETED' THEN por.total_price::numeric ELSE NULL END), 0)
    INTO v_orders_completed, v_orders_cancelled, v_total_volume, v_buy_count, v_sell_count, v_avg_time, v_avg_response, v_avg_size
    FROM terminal_order_assignments toa
    LEFT JOIN p2p_order_records por ON por.binance_order_number = toa.order_number
    WHERE toa.assigned_to = v_user.user_id
      AND (toa.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date;

    IF v_orders_handled > 0 THEN
      v_completion_rate := round((v_orders_completed::numeric / v_orders_handled::numeric) * 100, 2);
    ELSE
      v_completion_rate := 0;
    END IF;

    v_mpi := round(
      (v_completion_rate * 0.4) +
      (GREATEST(0, (1 - LEAST(v_avg_time, 60) / 60.0)) * 100 * 0.3) +
      (LEAST(v_orders_handled, 50) / 50.0 * 100 * 0.3)
    , 2);

    INSERT INTO terminal_mpi_snapshots (
      user_id, snapshot_date, orders_handled, orders_completed, orders_cancelled,
      total_volume, avg_completion_time_minutes, buy_count, sell_count, idle_time_minutes,
      completion_rate, avg_response_time_minutes, avg_order_size, mpi_score
    ) VALUES (
      v_user.user_id, p_date, v_orders_handled, v_orders_completed, v_orders_cancelled,
      v_total_volume, round(v_avg_time::numeric, 2), v_buy_count, v_sell_count, 0,
      v_completion_rate, round(v_avg_response::numeric, 2), round(v_avg_size::numeric, 2), v_mpi
    )
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      orders_handled = EXCLUDED.orders_handled,
      orders_completed = EXCLUDED.orders_completed,
      orders_cancelled = EXCLUDED.orders_cancelled,
      total_volume = EXCLUDED.total_volume,
      avg_completion_time_minutes = EXCLUDED.avg_completion_time_minutes,
      buy_count = EXCLUDED.buy_count,
      sell_count = EXCLUDED.sell_count,
      idle_time_minutes = EXCLUDED.idle_time_minutes,
      completion_rate = EXCLUDED.completion_rate,
      avg_response_time_minutes = EXCLUDED.avg_response_time_minutes,
      avg_order_size = EXCLUDED.avg_order_size,
      mpi_score = EXCLUDED.mpi_score;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;