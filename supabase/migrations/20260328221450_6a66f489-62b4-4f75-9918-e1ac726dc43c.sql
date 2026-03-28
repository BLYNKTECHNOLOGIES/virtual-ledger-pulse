-- B36+B37 FIX: Remove double-counting + restrict trigger to COMPLETED transitions
CREATE OR REPLACE FUNCTION check_counterparty_volume_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_monthly_volume numeric;
  v_limit numeric;
  v_nickname text;
BEGIN
  -- For UPDATE: only proceed if transitioning TO completed
  IF TG_OP = 'UPDATE' AND OLD.order_status ILIKE '%COMPLETED%' THEN
    RETURN NEW;
  END IF;

  -- Only check completed orders
  IF NEW.order_status NOT ILIKE '%COMPLETED%' THEN
    RETURN NEW;
  END IF;

  SELECT 
    COALESCE(SUM(por.total_price), 0),
    COALESCE(pc.monthly_volume_limit, 200000),
    pc.binance_nickname
  INTO v_monthly_volume, v_limit, v_nickname
  FROM p2p_counterparties pc
  LEFT JOIN p2p_order_records por ON por.counterparty_id = pc.id
    AND por.order_status ILIKE '%COMPLETED%'
    AND por.binance_create_time >= EXTRACT(EPOCH FROM date_trunc('month', now())) * 1000
  WHERE pc.id = NEW.counterparty_id
  GROUP BY pc.monthly_volume_limit, pc.binance_nickname;

  IF v_monthly_volume > v_limit THEN
    UPDATE p2p_counterparties
    SET is_flagged = true,
        flag_reason = COALESCE(flag_reason || '; ', '') || 
          'Monthly volume ₹' || round(v_monthly_volume)::text || ' exceeds limit ₹' || round(v_limit)::text ||
          ' on ' || to_char(now(), 'DD-Mon-YYYY')
    WHERE id = NEW.counterparty_id
      AND (is_flagged = false OR is_flagged IS NULL);

    IF NOT EXISTS (
      SELECT 1 FROM erp_tasks
      WHERE title LIKE '%' || COALESCE(v_nickname, NEW.counterparty_nickname) || '%volume%'
        AND status NOT IN ('completed', 'cancelled')
    ) THEN
      INSERT INTO erp_tasks (title, description, priority, status, tags)
      VALUES (
        'P2P volume breach: ' || COALESCE(v_nickname, NEW.counterparty_nickname),
        'Counterparty ' || COALESCE(v_nickname, NEW.counterparty_nickname) || 
        ' has crossed monthly volume limit of ₹' || round(v_limit)::text || 
        '. Current month volume: ₹' || round(v_monthly_volume)::text || 
        '. KYC/compliance review required.',
        'high', 'open',
        ARRAY['compliance', 'p2p', 'volume-breach', 'auto-flagged']
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Separate triggers: UPDATE with WHEN clause, INSERT with completed check in function
DROP TRIGGER IF EXISTS trg_check_counterparty_volume ON p2p_order_records;

CREATE TRIGGER trg_check_counterparty_volume_insert
  AFTER INSERT ON p2p_order_records
  FOR EACH ROW
  WHEN (NEW.order_status ILIKE '%COMPLETED%')
  EXECUTE FUNCTION check_counterparty_volume_threshold();

CREATE TRIGGER trg_check_counterparty_volume_update
  AFTER UPDATE ON p2p_order_records
  FOR EACH ROW
  WHEN (NEW.order_status ILIKE '%COMPLETED%' AND OLD.order_status NOT ILIKE '%COMPLETED%')
  EXECUTE FUNCTION check_counterparty_volume_threshold();