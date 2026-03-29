
-- W19: Auto-create erp_task on failed spot trades
CREATE OR REPLACE FUNCTION public.create_task_on_failed_spot_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'FAILED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM erp_tasks
      WHERE title = 'Spot trade FAILED: ' || NEW.symbol || ' ' || NEW.side || ' [' || NEW.id::text || ']'
    ) THEN
      INSERT INTO erp_tasks (title, description, priority, status, tags)
      VALUES (
        'Spot trade FAILED: ' || NEW.symbol || ' ' || NEW.side || ' [' || NEW.id::text || ']',
        'Spot trade failed on ' || to_char(NEW.created_at, 'DD-Mon-YYYY HH24:MI') ||
        '. Symbol: ' || NEW.symbol ||
        ', Side: ' || NEW.side ||
        ', Quantity: ' || COALESCE(NEW.quantity::text, 'N/A') ||
        ', Error: ' || COALESCE(NEW.error_message, 'Unknown') ||
        '. Requires operator review.',
        'high', 'open',
        ARRAY['spot-trade', 'failed', 'auto-flagged']
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spot_trade_failed_task ON spot_trade_history;
CREATE TRIGGER trg_spot_trade_failed_task
  AFTER INSERT OR UPDATE OF status ON spot_trade_history
  FOR EACH ROW
  WHEN (NEW.status = 'FAILED')
  EXECUTE FUNCTION create_task_on_failed_spot_trade();

-- W20: Fix upsert_p2p_counterparty to only update last_seen on re-sync (no count/volume inflation)
CREATE OR REPLACE FUNCTION public.upsert_p2p_counterparty(p_nickname text, p_trade_type text, p_volume numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO p2p_counterparties (binance_nickname, last_seen_at, total_buy_orders, total_sell_orders, total_volume_inr)
  VALUES (
    p_nickname,
    now(),
    CASE WHEN p_trade_type = 'BUY' THEN 1 ELSE 0 END,
    CASE WHEN p_trade_type = 'SELL' THEN 1 ELSE 0 END,
    COALESCE(p_volume, 0)
  )
  ON CONFLICT (binance_nickname) DO UPDATE SET
    last_seen_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- W21: Drop dangerous bypass_triggers RPC (uses session_replication_role = replica)
DROP FUNCTION IF EXISTS public.update_settlement_status_bypass_triggers(uuid[], text, timestamptz);

-- W22: TDS overdue alert function (callable by pg_cron or edge function daily)
CREATE OR REPLACE FUNCTION public.check_tds_overdue_and_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT;
  v_total NUMERIC;
  v_earliest DATE;
  v_task_title TEXT;
  v_month_label TEXT;
BEGIN
  v_month_label := to_char(now(), 'Mon-YYYY');
  v_task_title := 'TDS overdue alert [' || v_month_label || ']';

  IF EXISTS (
    SELECT 1 FROM erp_tasks
    WHERE title = v_task_title
      AND status NOT IN ('completed', 'cancelled')
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(tds_amount), 0), MIN(deduction_date)
  INTO v_count, v_total, v_earliest
  FROM tds_records
  WHERE payment_status = 'UNPAID'
    AND deduction_date < date_trunc('month', CURRENT_DATE);

  IF v_count > 0 THEN
    INSERT INTO erp_tasks (title, description, priority, status, tags)
    VALUES (
      v_task_title,
      v_count || ' TDS records totaling Rs.' || round(v_total)::text ||
      ' are unpaid. Earliest deduction: ' || to_char(v_earliest, 'DD-Mon-YYYY') ||
      '. Under Section 201, overdue TDS attracts 1.5%/month interest. Immediate payment required.',
      'high', 'open',
      ARRAY['tds', 'overdue', 'compliance', 'auto-flagged']
    );
  END IF;
END;
$$;
