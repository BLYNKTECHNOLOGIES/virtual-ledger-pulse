
CREATE TABLE IF NOT EXISTS public.cp_self_merchant_nos (merchant_no text primary key);
CREATE TABLE IF NOT EXISTS public.cp_self_nicknames (nick text primary key);
GRANT SELECT ON public.cp_self_merchant_nos TO authenticated;
GRANT SELECT ON public.cp_self_nicknames TO authenticated;
GRANT ALL ON public.cp_self_merchant_nos TO service_role;
GRANT ALL ON public.cp_self_nicknames TO service_role;
ALTER TABLE public.cp_self_merchant_nos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cp_self_nicknames ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read self merchant nos" ON public.cp_self_merchant_nos;
CREATE POLICY "staff read self merchant nos" ON public.cp_self_merchant_nos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "staff read self nicknames" ON public.cp_self_nicknames;
CREATE POLICY "staff read self nicknames" ON public.cp_self_nicknames FOR SELECT TO authenticated USING (true);

ALTER TABLE public.cp_order_identity ADD COLUMN IF NOT EXISTS exchange_account_id uuid;
CREATE INDEX IF NOT EXISTS idx_cp_order_identity_acct ON public.cp_order_identity (exchange_account_id);

CREATE OR REPLACE FUNCTION public.cp_identity_row(p_order_number text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.cp_order_identity as t
    (order_number, cp_userno, nickname, masked_nick, verified_name, total_price, create_time, order_status, exchange_account_id)
  SELECT h.order_number,
    CASE WHEN (h.order_detail_raw->>'merchantNo') IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM cp_self_merchant_nos s WHERE s.merchant_no = h.order_detail_raw->>'merchantNo')
         THEN h.order_detail_raw->>'merchantNo'
         ELSE h.order_detail_raw->>'takerUserNo' END,
    COALESCE(
      CASE WHEN h.counter_part_nick_name IS NOT NULL AND h.counter_part_nick_name NOT LIKE '%*%'
           THEN h.counter_part_nick_name END,
      (SELECT v.n FROM (VALUES (h.order_detail_raw->>'buyerNickname'), (h.order_detail_raw->>'sellerNickname')) v(n)
        WHERE v.n IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cp_self_nicknames sn WHERE sn.nick = v.n) LIMIT 1),
      (SELECT m.sender_nickname FROM binance_order_chat_messages m
        WHERE m.order_number = h.order_number AND m.sender_is_self = false AND m.sender_nickname IS NOT NULL
        LIMIT 1)
    ),
    CASE WHEN h.counter_part_nick_name LIKE '%*%' THEN h.counter_part_nick_name END,
    h.verified_name,
    CASE WHEN h.total_price::text ~ '^[0-9]+(\.[0-9]+)?$' THEN h.total_price::text::numeric END,
    h.create_time, h.order_status, h.exchange_account_id
  FROM binance_order_history h
  WHERE h.order_number = p_order_number
  ON CONFLICT (order_number) DO UPDATE SET
    cp_userno = COALESCE(EXCLUDED.cp_userno, t.cp_userno),
    nickname = COALESCE(EXCLUDED.nickname, t.nickname),
    masked_nick = COALESCE(EXCLUDED.masked_nick, t.masked_nick),
    verified_name = COALESCE(EXCLUDED.verified_name, t.verified_name),
    total_price = COALESCE(EXCLUDED.total_price, t.total_price),
    create_time = COALESCE(EXCLUDED.create_time, t.create_time),
    order_status = COALESCE(EXCLUDED.order_status, t.order_status),
    exchange_account_id = COALESCE(EXCLUDED.exchange_account_id, t.exchange_account_id);
$$;

CREATE OR REPLACE FUNCTION public.trg_cp_order_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.cp_identity_row(NEW.order_number);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS maintain_cp_order_identity ON public.binance_order_history;
CREATE TRIGGER maintain_cp_order_identity
AFTER INSERT OR UPDATE ON public.binance_order_history
FOR EACH ROW EXECUTE FUNCTION public.trg_cp_order_identity();

CREATE OR REPLACE FUNCTION public.rebuild_cp_order_identity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM cp_self_merchant_nos;
  INSERT INTO cp_self_merchant_nos(merchant_no)
  SELECT order_detail_raw->>'merchantNo'
  FROM binance_order_history
  WHERE order_detail_raw ? 'merchantNo' AND order_detail_raw->>'merchantNo' IS NOT NULL
  GROUP BY 1
  HAVING count(distinct order_detail_raw->>'takerUserNo') >= 5;

  DELETE FROM cp_self_nicknames;
  INSERT INTO cp_self_nicknames(nick)
  SELECT nick FROM (
    SELECT order_detail_raw->>'buyerNickname' AS nick FROM binance_order_history WHERE order_detail_raw ? 'buyerNickname'
    UNION ALL
    SELECT order_detail_raw->>'sellerNickname' FROM binance_order_history WHERE order_detail_raw ? 'sellerNickname'
  ) x WHERE nick IS NOT NULL GROUP BY 1 HAVING count(*) >= 50;

  INSERT INTO public.cp_order_identity as t
    (order_number, cp_userno, nickname, masked_nick, verified_name, total_price, create_time, order_status, exchange_account_id)
  SELECT h.order_number,
    CASE WHEN (h.order_detail_raw->>'merchantNo') IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM cp_self_merchant_nos s WHERE s.merchant_no = h.order_detail_raw->>'merchantNo')
         THEN h.order_detail_raw->>'merchantNo'
         ELSE h.order_detail_raw->>'takerUserNo' END,
    COALESCE(
      CASE WHEN h.counter_part_nick_name IS NOT NULL AND h.counter_part_nick_name NOT LIKE '%*%'
           THEN h.counter_part_nick_name END,
      (SELECT v.n FROM (VALUES (h.order_detail_raw->>'buyerNickname'), (h.order_detail_raw->>'sellerNickname')) v(n)
        WHERE v.n IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cp_self_nicknames sn WHERE sn.nick = v.n) LIMIT 1),
      (SELECT m.sender_nickname FROM binance_order_chat_messages m
        WHERE m.order_number = h.order_number AND m.sender_is_self = false AND m.sender_nickname IS NOT NULL
        LIMIT 1)
    ),
    CASE WHEN h.counter_part_nick_name LIKE '%*%' THEN h.counter_part_nick_name END,
    h.verified_name,
    CASE WHEN h.total_price::text ~ '^[0-9]+(\.[0-9]+)?$' THEN h.total_price::text::numeric END,
    h.create_time, h.order_status, h.exchange_account_id
  FROM binance_order_history h
  ON CONFLICT (order_number) DO UPDATE SET
    cp_userno = EXCLUDED.cp_userno,
    nickname = COALESCE(EXCLUDED.nickname, t.nickname),
    masked_nick = EXCLUDED.masked_nick,
    verified_name = COALESCE(EXCLUDED.verified_name, t.verified_name),
    total_price = EXCLUDED.total_price,
    create_time = EXCLUDED.create_time,
    order_status = EXCLUDED.order_status,
    exchange_account_id = EXCLUDED.exchange_account_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_counterparty_profile(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(counterparty_no text, counterparty_nickname text, verified_name text, total_orders bigint, completed_orders bigint, cancelled_orders bigint, complaint_orders bigint, buy_orders bigint, sell_orders bigint, total_value numeric, avg_value numeric, median_value numeric, total_asset_amount numeric, first_trade_time bigint, last_trade_time bigint, top_pay_method text, avg_pay_minutes numeric, pay_sample bigint, avg_release_minutes numeric, release_sample bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cur as (
    select i.cp_userno, i.nickname, i.verified_name
    from cp_order_identity i
    where i.order_number = p_order_number
    limit 1
  ),
  matched as (
    select i.order_number
    from cp_order_identity i, cur c
    where (c.cp_userno is not null and i.cp_userno = c.cp_userno)
       or (c.nickname is not null and i.nickname = c.nickname)
  ),
  scoped as (
    select h.* from binance_order_history h
    where h.order_number in (select order_number from matched)
      and (p_exchange_account_id is null or h.exchange_account_id = p_exchange_account_id)
  ),
  timings as (
    select
      case when (order_detail_raw->>'notifyPayTime') ~ '^[0-9]+$'
                and (order_detail_raw->>'createTime') ~ '^[0-9]+$'
                and (order_detail_raw->>'notifyPayTime')::bigint > (order_detail_raw->>'createTime')::bigint
        then ((order_detail_raw->>'notifyPayTime')::bigint - (order_detail_raw->>'createTime')::bigint) / 60000.0
      end as pay_min,
      case when (order_detail_raw->>'confirmPayTime') ~ '^[0-9]+$'
                and (order_detail_raw->>'notifyPayTime') ~ '^[0-9]+$'
                and (order_detail_raw->>'confirmPayTime')::bigint > (order_detail_raw->>'notifyPayTime')::bigint
        then ((order_detail_raw->>'confirmPayTime')::bigint - (order_detail_raw->>'notifyPayTime')::bigint) / 60000.0
      end as rel_min
    from scoped
  ),
  paym as (
    select pay_method_name, count(*) c from scoped
    where pay_method_name is not null and pay_method_name <> ''
    group by 1 order by c desc limit 1
  )
  select
    (select cp_userno from cur)::text,
    (select nickname from cur)::text,
    (select verified_name from cur)::text,
    count(*)::bigint,
    count(*) filter (where s.order_status in ('COMPLETED','4'))::bigint,
    count(*) filter (where s.order_status in ('CANCELLED','CANCELLED_BY_SYSTEM','6','7'))::bigint,
    count(*) filter (where s.has_active_complaint is true or s.complaint_status is not null)::bigint,
    count(*) filter (where upper(coalesce(s.trade_type,'')) = 'BUY')::bigint,
    count(*) filter (where upper(coalesce(s.trade_type,'')) = 'SELL')::bigint,
    coalesce(sum(nullif(s.total_price::text,'')::numeric) filter (where s.order_status in ('COMPLETED','4')), 0)::numeric,
    coalesce(avg(nullif(s.total_price::text,'')::numeric) filter (where s.order_status in ('COMPLETED','4')), 0)::numeric,
    coalesce(percentile_cont(0.5) within group (order by nullif(s.total_price::text,'')::numeric)
               filter (where s.order_status in ('COMPLETED','4')), 0)::numeric,
    coalesce(sum(nullif(s.amount::text,'')::numeric) filter (where s.order_status in ('COMPLETED','4')), 0)::numeric,
    min(s.create_time)::bigint,
    max(s.create_time)::bigint,
    (select pay_method_name from paym)::text,
    (select round(avg(pay_min)::numeric, 1) from timings where pay_min is not null)::numeric,
    (select count(*)::bigint from timings where pay_min is not null),
    (select round(avg(rel_min)::numeric, 1) from timings where rel_min is not null)::numeric,
    (select count(*)::bigint from timings where rel_min is not null)
  from scoped s;
$function$;

CREATE OR REPLACE FUNCTION public.get_counterparty_order_history(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_number text, trade_type text, asset text, total_price text, fiat_unit text, create_time bigint, exchange_account_id uuid, order_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cur as (
    select i.cp_userno, i.nickname from cp_order_identity i
    where i.order_number = p_order_number limit 1
  ),
  matched as (
    select i.order_number from cp_order_identity i, cur c
    where i.order_number <> p_order_number
      and ((c.cp_userno is not null and i.cp_userno = c.cp_userno)
        or (c.nickname is not null and i.nickname = c.nickname))
  )
  select h.order_number, h.trade_type, h.asset, h.total_price::text, h.fiat_unit,
         h.create_time, h.exchange_account_id, h.order_status
  from binance_order_history h
  where h.order_number in (select order_number from matched)
    and (p_exchange_account_id is null or h.exchange_account_id = p_exchange_account_id)
  order by h.create_time desc
  limit 300;
$function$;

GRANT EXECUTE ON FUNCTION public.get_counterparty_profile(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_counterparty_order_history(text, uuid) TO authenticated;
