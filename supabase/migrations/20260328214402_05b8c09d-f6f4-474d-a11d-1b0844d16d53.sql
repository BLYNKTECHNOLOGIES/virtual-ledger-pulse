CREATE OR REPLACE FUNCTION flag_stale_pending_settlements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale record;
  v_count integer := 0;
BEGIN
  FOR v_stale IN
    SELECT ps.id, ps.sales_order_id, so.order_number, ps.total_amount,
           ps.created_at, EXTRACT(DAY FROM now() - ps.created_at)::int as days_pending
    FROM pending_settlements ps
    JOIN sales_orders so ON so.id = ps.sales_order_id
    WHERE ps.status = 'PENDING'
      AND ps.created_at < now() - interval '7 days'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM erp_tasks
      WHERE title LIKE '%' || v_stale.order_number || '%'
        AND status NOT IN ('completed', 'cancelled')
    ) THEN
      INSERT INTO erp_tasks (
        title, description, priority, status, tags
      ) VALUES (
        'Stale Settlement: ' || v_stale.order_number || ' (' || v_stale.days_pending || ' days)',
        'Pending settlement of ₹' || v_stale.total_amount::text || ' for order ' || v_stale.order_number ||
        ' has been pending for ' || v_stale.days_pending || ' days since ' ||
        to_char(v_stale.created_at, 'DD-Mon-YYYY') || '. Requires immediate attention.',
        'high',
        'open',
        ARRAY['settlement', 'stale', 'auto-flagged']
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;