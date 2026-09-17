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
    COALESCE(sum(NULLIF(h.total_price, '')::numeric) FILTER (WHERE h.order_status = 'COMPLETED'), 0),
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