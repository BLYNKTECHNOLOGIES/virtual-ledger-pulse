CREATE OR REPLACE FUNCTION public.recompute_p2p_counterparty_totals(p_nickname text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_buy int := 0;
  v_sell int := 0;
  v_vol numeric := 0;
  v_first timestamptz;
  v_last timestamptz;
BEGIN
  IF p_nickname IS NULL OR btrim(p_nickname) = '' THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE h.trade_type = 'BUY'),
    count(*) FILTER (WHERE h.trade_type = 'SELL'),
    COALESCE(sum(h.total_price) FILTER (WHERE h.order_status = 'COMPLETED'), 0),
    to_timestamp(min(h.create_time) / 1000.0),
    to_timestamp(max(h.create_time) / 1000.0)
  INTO v_buy, v_sell, v_vol, v_first, v_last
  FROM public.binance_order_history h
  WHERE h.counter_part_nick_name = p_nickname;

  UPDATE public.p2p_counterparties c
     SET total_buy_orders = COALESCE(v_buy, 0),
         total_sell_orders = COALESCE(v_sell, 0),
         total_volume_inr = COALESCE(v_vol, 0),
         first_seen_at = LEAST(COALESCE(v_first, c.first_seen_at), c.first_seen_at),
         last_seen_at = GREATEST(COALESCE(v_last, c.last_seen_at), c.last_seen_at),
         updated_at = now()
   WHERE c.binance_nickname = p_nickname;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_p2p_counterparty(p_nickname text, p_trade_type text, p_volume numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Totals are always recomputed from the authoritative order archive, so the
  -- local tracking counters can never freeze at the first sighting again.
  PERFORM public.recompute_p2p_counterparty_totals(p_nickname);

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_p2p_counterparty_totals(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_p2p_counterparty_totals(text) TO service_role;

-- Keep totals fresh as new orders land in the archive.
CREATE OR REPLACE FUNCTION public.trg_refresh_counterparty_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.counter_part_nick_name IS NOT NULL AND btrim(NEW.counter_part_nick_name) <> '' THEN
    PERFORM public.recompute_p2p_counterparty_totals(NEW.counter_part_nick_name);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS refresh_counterparty_totals ON public.binance_order_history;
CREATE TRIGGER refresh_counterparty_totals
AFTER INSERT OR UPDATE OF order_status, total_price, trade_type ON public.binance_order_history
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_counterparty_totals();