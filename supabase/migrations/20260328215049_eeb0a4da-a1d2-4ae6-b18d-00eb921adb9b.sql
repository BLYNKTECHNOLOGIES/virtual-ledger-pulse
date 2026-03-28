-- W1: Add monthly volume threshold to p2p_counterparties and auto-flag during sync
ALTER TABLE p2p_counterparties ADD COLUMN IF NOT EXISTS monthly_volume_limit numeric DEFAULT 200000;

-- Function to check and flag counterparty volume breaches
CREATE OR REPLACE FUNCTION check_counterparty_volume_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly_volume numeric;
  v_limit numeric;
  v_nickname text;
BEGIN
  -- Only check on completed orders
  IF NEW.order_status NOT ILIKE '%COMPLETED%' THEN
    RETURN NEW;
  END IF;

  -- Get counterparty's monthly volume and limit
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

  -- Add current order's value
  v_monthly_volume := v_monthly_volume + COALESCE(NEW.total_price, 0);

  IF v_monthly_volume > v_limit THEN
    -- Flag the counterparty
    UPDATE p2p_counterparties
    SET is_flagged = true,
        flag_reason = COALESCE(flag_reason || '; ', '') || 
          'Monthly volume ₹' || round(v_monthly_volume)::text || ' exceeds limit ₹' || round(v_limit)::text ||
          ' on ' || to_char(now(), 'DD-Mon-YYYY')
    WHERE id = NEW.counterparty_id
      AND (is_flagged = false OR is_flagged IS NULL);

    -- Create ERP task if not already flagged
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
$$;

DROP TRIGGER IF EXISTS trg_check_counterparty_volume ON p2p_order_records;
CREATE TRIGGER trg_check_counterparty_volume
  AFTER INSERT OR UPDATE ON p2p_order_records
  FOR EACH ROW EXECUTE FUNCTION check_counterparty_volume_threshold();

-- W3: Daily reconciliation summary view (no new tab — queryable view)
CREATE OR REPLACE VIEW daily_reconciliation_summary AS
SELECT 
  DATE(sr.submitted_at) as recon_date,
  sr.shift_label,
  sr.status,
  sr.has_mismatches,
  sr.mismatch_count,
  jsonb_array_length(COALESCE(sr.submitted_data, '[]'::jsonb)) as method_count,
  (SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) 
   FROM jsonb_array_elements(COALESCE(sr.submitted_data, '[]'::jsonb)) elem
   WHERE elem->>'amount' IS NOT NULL) as total_submitted_amount,
  sr.submitted_at,
  sr.reviewed_at,
  sr.id
FROM shift_reconciliations sr
ORDER BY sr.submitted_at DESC;