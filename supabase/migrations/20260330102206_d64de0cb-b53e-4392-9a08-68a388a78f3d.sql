
-- Drop P2P volume breach triggers that auto-create erp_tasks
DROP TRIGGER IF EXISTS trg_check_counterparty_volume_insert ON p2p_order_records;
DROP TRIGGER IF EXISTS trg_check_counterparty_volume_update ON p2p_order_records;
DROP TRIGGER IF EXISTS trg_check_counterparty_volume ON p2p_order_records;

-- Rewrite check_counterparty_volume_threshold to ONLY flag the counterparty, NOT create tasks
CREATE OR REPLACE FUNCTION public.check_counterparty_volume_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_monthly_volume numeric;
  v_limit numeric;
  v_nickname text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.order_status ILIKE '%COMPLETED%' THEN
    RETURN NEW;
  END IF;

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
        flag_reason = 'Monthly volume Rs.' || round(v_monthly_volume)::text || ' exceeds limit Rs.' || round(v_limit)::text ||
          ' (updated ' || to_char(now(), 'DD-Mon-YYYY HH24:MI') || ')'
    WHERE id = NEW.counterparty_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Re-create the triggers (flagging only, no task creation)
CREATE TRIGGER trg_check_counterparty_volume_insert
  AFTER INSERT ON p2p_order_records
  FOR EACH ROW
  EXECUTE FUNCTION check_counterparty_volume_threshold();

CREATE TRIGGER trg_check_counterparty_volume_update
  AFTER UPDATE ON p2p_order_records
  FOR EACH ROW
  WHEN (OLD.order_status IS DISTINCT FROM NEW.order_status)
  EXECUTE FUNCTION check_counterparty_volume_threshold();

-- Neuter flag_stale_pending_settlements to no longer create tasks
CREATE OR REPLACE FUNCTION public.flag_stale_pending_settlements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;
