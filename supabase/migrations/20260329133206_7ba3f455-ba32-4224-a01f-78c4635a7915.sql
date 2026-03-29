
-- Reverse W19: Drop the failed spot trade trigger
DROP TRIGGER IF EXISTS trg_spot_trade_failed_task ON spot_trade_history;
DROP FUNCTION IF EXISTS public.create_task_on_failed_spot_trade();

-- Reverse W20: Restore original upsert_p2p_counterparty with accumulation logic
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
    total_buy_orders = p2p_counterparties.total_buy_orders + CASE WHEN p_trade_type = 'BUY' THEN 1 ELSE 0 END,
    total_sell_orders = p2p_counterparties.total_sell_orders + CASE WHEN p_trade_type = 'SELL' THEN 1 ELSE 0 END,
    total_volume_inr = p2p_counterparties.total_volume_inr + COALESCE(p_volume, 0),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Reverse W21: Restore update_settlement_status_bypass_triggers
CREATE OR REPLACE FUNCTION public.update_settlement_status_bypass_triggers(order_ids uuid[], batch_id text, settled_timestamp timestamp with time zone)
RETURNS TABLE(updated_id uuid, success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_id UUID;
  rows_affected INTEGER;
BEGIN
  SET session_replication_role = replica;
  FOREACH order_id IN ARRAY order_ids
  LOOP
    BEGIN
      UPDATE sales_orders 
      SET 
        settlement_status = 'SETTLED',
        settlement_batch_id = batch_id,
        settled_at = settled_timestamp,
        updated_at = NOW()
      WHERE id = order_id 
        AND settlement_status = 'PENDING'
        AND payment_status = 'COMPLETED';
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      IF rows_affected > 0 THEN
        RETURN QUERY SELECT order_id, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT order_id, FALSE, 'Order not found, already settled, or not completed'::TEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
  SET session_replication_role = DEFAULT;
END;
$$;

-- Reverse W22: Drop TDS overdue alert function
DROP FUNCTION IF EXISTS public.check_tds_overdue_and_alert();
