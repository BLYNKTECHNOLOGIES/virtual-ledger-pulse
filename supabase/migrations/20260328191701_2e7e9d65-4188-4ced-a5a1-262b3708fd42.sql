-- L2 Fix: Make COMPLETED rank higher than CANCELLED/APPEAL/EXPIRED to prevent backward transitions
-- COMPLETED (rank 4) can never be overwritten by CANCELLED (rank 3)
CREATE OR REPLACE FUNCTION sync_p2p_order(
  p_order_number TEXT,
  p_adv_no TEXT,
  p_nickname TEXT,
  p_trade_type TEXT,
  p_asset TEXT,
  p_fiat TEXT,
  p_amount NUMERIC,
  p_total_price NUMERIC,
  p_unit_price NUMERIC,
  p_commission NUMERIC,
  p_status TEXT,
  p_pay_method TEXT,
  p_create_time BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_counterparty_id UUID;
  v_is_repeat BOOLEAN := false;
  v_repeat_count INT := 0;
  v_order_id UUID;
  v_existing_status TEXT;
  v_effective_status TEXT;
  v_status_rank_old INT;
  v_status_rank_new INT;
BEGIN
  v_counterparty_id := upsert_p2p_counterparty(p_nickname, p_trade_type, p_total_price);

  SELECT COUNT(*) INTO v_repeat_count
  FROM p2p_order_records
  WHERE counterparty_id = v_counterparty_id
    AND binance_order_number != p_order_number;

  v_is_repeat := v_repeat_count > 0;

  SELECT order_status INTO v_existing_status
  FROM p2p_order_records
  WHERE binance_order_number = p_order_number;

  -- Fixed ranking: COMPLETED (4) > CANCELLED/APPEAL/EXPIRED (3)
  v_status_rank_old := CASE
    WHEN v_existing_status IS NULL THEN -1
    WHEN v_existing_status ILIKE '%PENDING%' THEN 0
    WHEN v_existing_status ILIKE '%TRADING%' THEN 1
    WHEN v_existing_status ILIKE '%BUYER_PAY%' OR v_existing_status ILIKE '%BUYER_PAID%' THEN 2
    WHEN v_existing_status ILIKE '%APPEAL%' THEN 3
    WHEN v_existing_status ILIKE '%CANCEL%' THEN 3
    WHEN v_existing_status ILIKE '%EXPIRED%' THEN 3
    WHEN v_existing_status ILIKE '%COMPLETED%' THEN 4
    ELSE 0
  END;

  v_status_rank_new := CASE
    WHEN p_status ILIKE '%PENDING%' THEN 0
    WHEN p_status ILIKE '%TRADING%' THEN 1
    WHEN p_status ILIKE '%BUYER_PAY%' OR p_status ILIKE '%BUYER_PAID%' THEN 2
    WHEN p_status ILIKE '%APPEAL%' THEN 3
    WHEN p_status ILIKE '%CANCEL%' THEN 3
    WHEN p_status ILIKE '%EXPIRED%' THEN 3
    WHEN p_status ILIKE '%COMPLETED%' THEN 4
    ELSE 0
  END;

  IF v_status_rank_new >= v_status_rank_old THEN
    v_effective_status := p_status;
  ELSE
    v_effective_status := v_existing_status;
  END IF;

  INSERT INTO p2p_order_records (
    binance_order_number, binance_adv_no, counterparty_id, counterparty_nickname,
    trade_type, asset, fiat_unit, amount, total_price, unit_price, commission,
    order_status, pay_method_name, binance_create_time,
    is_repeat_client, repeat_order_count
  ) VALUES (
    p_order_number, p_adv_no, v_counterparty_id, p_nickname,
    p_trade_type, p_asset, p_fiat, p_amount, p_total_price, p_unit_price, p_commission,
    v_effective_status, p_pay_method, p_create_time,
    v_is_repeat, v_repeat_count
  )
  ON CONFLICT (binance_order_number) DO UPDATE SET
    order_status = v_effective_status,
    counterparty_id = EXCLUDED.counterparty_id,
    is_repeat_client = v_is_repeat,
    repeat_order_count = v_repeat_count,
    total_price = CASE WHEN EXCLUDED.total_price > 0 THEN EXCLUDED.total_price ELSE p2p_order_records.total_price END,
    amount = CASE WHEN EXCLUDED.amount > 0 THEN EXCLUDED.amount ELSE p2p_order_records.amount END,
    unit_price = CASE WHEN EXCLUDED.unit_price > 0 THEN EXCLUDED.unit_price ELSE p2p_order_records.unit_price END,
    commission = CASE WHEN EXCLUDED.commission > 0 THEN EXCLUDED.commission ELSE p2p_order_records.commission END,
    updated_at = now(),
    completed_at = CASE WHEN v_effective_status ILIKE '%COMPLETED%' AND p2p_order_records.completed_at IS NULL THEN now() ELSE p2p_order_records.completed_at END,
    cancelled_at = CASE WHEN v_effective_status ILIKE '%CANCEL%' AND p2p_order_records.cancelled_at IS NULL THEN now() ELSE p2p_order_records.cancelled_at END
  RETURNING id INTO v_order_id;

  IF v_effective_status ILIKE '%CANCEL%' THEN
    DELETE FROM p2p_order_chats WHERE order_id = v_order_id;
  END IF;

  IF v_effective_status ILIKE '%COMPLETED%' THEN
    UPDATE p2p_chat_media
    SET expires_at = now() + interval '7 days'
    WHERE order_id = v_order_id
      AND expires_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'is_repeat', v_is_repeat,
    'repeat_count', v_repeat_count,
    'status', v_effective_status
  );
END;
$$;