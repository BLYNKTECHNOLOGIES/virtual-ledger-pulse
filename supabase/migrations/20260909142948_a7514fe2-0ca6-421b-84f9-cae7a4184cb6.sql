CREATE OR REPLACE FUNCTION public.get_counterparty_panel(
  p_order_number text,
  p_exchange_account_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_orders(auth.uid()) THEN
    RAISE EXCEPTION 'Insufficient permission to view Terminal order details'
      USING ERRCODE = '42501';
  END IF;

  WITH identity_source AS (
    SELECT i.cp_userno, i.nickname, i.verified_name,
           COALESCE(p_exchange_account_id, i.exchange_account_id) AS account_id
    FROM public.cp_order_identity i
    WHERE i.order_number = p_order_number
    LIMIT 1
  ),
  direct_fallback AS (
    SELECT
      CASE
        WHEN h.order_detail_raw->>'merchantNo' IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.cp_self_merchant_nos s
            WHERE s.merchant_no = h.order_detail_raw->>'merchantNo'
          )
        THEN h.order_detail_raw->>'merchantNo'
        ELSE h.order_detail_raw->>'takerUserNo'
      END AS cp_userno,
      COALESCE(
        CASE WHEN h.counter_part_nick_name IS NOT NULL AND h.counter_part_nick_name NOT LIKE '%*%'
             THEN h.counter_part_nick_name END,
        (
          SELECT v.nickname
          FROM (VALUES (h.order_detail_raw->>'buyerNickname'), (h.order_detail_raw->>'sellerNickname')) AS v(nickname)
          WHERE v.nickname IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.cp_self_nicknames s WHERE s.nick = v.nickname)
          LIMIT 1
        )
      ) AS nickname,
      h.verified_name,
      COALESCE(p_exchange_account_id, h.exchange_account_id) AS account_id
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
      AND (p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id)
    LIMIT 1
  ),
  current_identity AS (
    SELECT * FROM identity_source
    UNION ALL
    SELECT * FROM direct_fallback WHERE NOT EXISTS (SELECT 1 FROM identity_source)
    LIMIT 1
  ),
  matched_orders AS MATERIALIZED (
    SELECT DISTINCT i.order_number
    FROM public.cp_order_identity i
    CROSS JOIN current_identity c
    WHERE i.exchange_account_id IS NOT DISTINCT FROM c.account_id
      AND (
        (c.cp_userno IS NOT NULL AND i.cp_userno = c.cp_userno)
        OR (c.cp_userno IS NULL AND c.nickname IS NOT NULL AND i.nickname = c.nickname)
      )
    UNION
    SELECT p_order_number WHERE EXISTS (SELECT 1 FROM current_identity)
  ),
  scoped AS MATERIALIZED (
    SELECT h.*
    FROM public.binance_order_history h
    JOIN matched_orders m ON m.order_number = h.order_number
    WHERE p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id
  ),
  timings AS (
    SELECT
      CASE WHEN order_detail_raw->>'notifyPayTime' ~ '^[0-9]+$'
             AND order_detail_raw->>'createTime' ~ '^[0-9]+$'
             AND (order_detail_raw->>'notifyPayTime')::bigint > (order_detail_raw->>'createTime')::bigint
           THEN ((order_detail_raw->>'notifyPayTime')::bigint - (order_detail_raw->>'createTime')::bigint) / 60000.0 END AS pay_min,
      CASE WHEN order_detail_raw->>'confirmPayTime' ~ '^[0-9]+$'
             AND order_detail_raw->>'notifyPayTime' ~ '^[0-9]+$'
             AND (order_detail_raw->>'confirmPayTime')::bigint > (order_detail_raw->>'notifyPayTime')::bigint
           THEN ((order_detail_raw->>'confirmPayTime')::bigint - (order_detail_raw->>'notifyPayTime')::bigint) / 60000.0 END AS rel_min
    FROM scoped
  ),
  profile AS (
    SELECT jsonb_build_object(
      'counterparty_no', (SELECT cp_userno FROM current_identity),
      'counterparty_nickname', (SELECT nickname FROM current_identity),
      'verified_name', (SELECT verified_name FROM current_identity),
      'total_orders', count(*),
      'completed_orders', count(*) FILTER (WHERE s.order_status IN ('COMPLETED','4')),
      'cancelled_orders', count(*) FILTER (WHERE s.order_status IN ('CANCELLED','CANCELLED_BY_SYSTEM','6','7')),
      'complaint_orders', count(*) FILTER (WHERE s.has_active_complaint IS TRUE OR s.complaint_status IS NOT NULL),
      'buy_orders', count(*) FILTER (WHERE upper(coalesce(s.trade_type,'')) = 'BUY'),
      'sell_orders', count(*) FILTER (WHERE upper(coalesce(s.trade_type,'')) = 'SELL'),
      'total_value', coalesce(sum(s.total_price::numeric) FILTER (WHERE s.order_status IN ('COMPLETED','4') AND s.total_price ~ '^[0-9]+(\.[0-9]+)?$'), 0),
      'avg_value', coalesce(avg(s.total_price::numeric) FILTER (WHERE s.order_status IN ('COMPLETED','4') AND s.total_price ~ '^[0-9]+(\.[0-9]+)?$'), 0),
      'median_value', coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY s.total_price::numeric) FILTER (WHERE s.order_status IN ('COMPLETED','4') AND s.total_price ~ '^[0-9]+(\.[0-9]+)?$'), 0),
      'total_asset_amount', coalesce(sum(s.amount::numeric) FILTER (WHERE s.order_status IN ('COMPLETED','4') AND s.amount ~ '^[0-9]+(\.[0-9]+)?$'), 0),
      'first_trade_time', min(s.create_time), 'last_trade_time', max(s.create_time),
      'top_pay_method', (SELECT x.pay_method_name FROM scoped x WHERE x.pay_method_name IS NOT NULL AND x.pay_method_name <> '' GROUP BY x.pay_method_name ORDER BY count(*) DESC LIMIT 1),
      'avg_pay_minutes', (SELECT round(avg(pay_min)::numeric, 1) FROM timings WHERE pay_min IS NOT NULL),
      'pay_sample', (SELECT count(*) FROM timings WHERE pay_min IS NOT NULL),
      'avg_release_minutes', (SELECT round(avg(rel_min)::numeric, 1) FROM timings WHERE rel_min IS NOT NULL),
      'release_sample', (SELECT count(*) FROM timings WHERE rel_min IS NOT NULL)
    ) AS value FROM scoped s
  ),
  past_orders AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'order_number', x.order_number, 'trade_type', x.trade_type, 'asset', x.asset,
      'total_price', x.total_price, 'fiat_unit', x.fiat_unit, 'create_time', x.create_time,
      'exchange_account_id', x.exchange_account_id, 'order_status', x.order_status
    ) ORDER BY x.create_time DESC), '[]'::jsonb) AS value
    FROM (
      SELECT s.order_number, s.trade_type, s.asset, s.total_price, s.fiat_unit,
             s.create_time, s.exchange_account_id, s.order_status
      FROM scoped s WHERE s.order_number <> p_order_number
      ORDER BY s.create_time DESC LIMIT 300
    ) x
  )
  SELECT jsonb_build_object(
    'profile', CASE WHEN (SELECT count(*) FROM scoped) = 0 THEN NULL ELSE (SELECT value FROM profile) END,
    'past_orders', (SELECT value FROM past_orders)
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_counterparty_panel(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_counterparty_panel(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_counterparty_panel(text, uuid) TO service_role;