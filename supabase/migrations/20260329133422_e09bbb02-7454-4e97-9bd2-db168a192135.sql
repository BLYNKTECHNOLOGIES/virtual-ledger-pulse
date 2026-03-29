
-- B48: Drop unused dead-code RPCs
DROP FUNCTION IF EXISTS public.create_manual_purchase_bypass(text, text, date, text, numeric, text, text, uuid, uuid, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_bypass_locks(text, text, date, text, numeric, text, uuid, uuid, numeric, numeric, uuid);

-- B49: Fix upsert_p2p_counterparty — stop inflating counts/volume on re-sync
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
