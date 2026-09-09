CREATE OR REPLACE FUNCTION public.get_counterparty_profile(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(
   counterparty_no text,
   counterparty_nickname text,
   verified_name text,
   total_orders bigint,
   completed_orders bigint,
   cancelled_orders bigint,
   complaint_orders bigint,
   buy_orders bigint,
   sell_orders bigint,
   total_value numeric,
   avg_value numeric,
   median_value numeric,
   total_asset_amount numeric,
   first_trade_time bigint,
   last_trade_time bigint,
   top_pay_method text,
   avg_pay_minutes numeric,
   pay_sample bigint,
   avg_release_minutes numeric,
   release_sample bigint
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with self_nos as (
    select merchant_no
    from (
      select order_detail_raw->>'merchantNo' as merchant_no,
             count(distinct order_detail_raw->>'takerUserNo') as takers
      from binance_order_history
      where order_detail_raw ? 'merchantNo'
      group by 1
    ) d
    where d.merchant_no is not null and d.takers >= 5
  ),
  self_nicks as (
    select nick from (
      select nick, count(*) c from (
        select order_detail_raw->>'buyerNickname' as nick from binance_order_history where order_detail_raw ? 'buyerNickname'
        union all
        select order_detail_raw->>'sellerNickname' from binance_order_history where order_detail_raw ? 'sellerNickname'
      ) x where nick is not null group by 1
    ) y where c >= 50
  ),
  cur as (
    select order_detail_raw->>'merchantNo' as m,
           order_detail_raw->>'takerUserNo' as t,
           binance_order_history.verified_name as vn,
           binance_order_history.counter_part_nick_name as cn
    from binance_order_history
    where binance_order_history.order_number = p_order_number
    limit 1
  ),
  cp as (
    select case
      when (select m from cur) is not null
           and (select m from cur) not in (select merchant_no from self_nos)
        then (select m from cur)
      else (select t from cur)
    end as cp_no
  ),
  cur_nick as (
    select nick from (
      select order_detail_raw->>'buyerNickname' as nick
      from binance_order_history where binance_order_history.order_number = p_order_number
      union all
      select order_detail_raw->>'sellerNickname'
      from binance_order_history where binance_order_history.order_number = p_order_number
      union all
      select (select cn from cur)
      union all
      select m.sender_nickname
      from binance_order_chat_messages m
      where m.order_number = p_order_number
        and m.sender_is_self = false
        and m.sender_nickname is not null
    ) z
    where nick is not null
      and nick not in (select sn.nick from self_nicks sn)
    limit 1
  ),
  matches as (
    select h.*
    from binance_order_history h
    where (select cp_no from cp) is not null
      and (
        case
          when (h.order_detail_raw->>'merchantNo') is not null
               and (h.order_detail_raw->>'merchantNo') not in (select merchant_no from self_nos)
            then h.order_detail_raw->>'merchantNo'
          else h.order_detail_raw->>'takerUserNo'
        end
      ) = (select cp_no from cp)

    union

    select h.*
    from binance_order_history h
    where (select nick from cur_nick) is not null
      and (
        h.order_detail_raw->>'buyerNickname' = (select nick from cur_nick)
        or h.order_detail_raw->>'sellerNickname' = (select nick from cur_nick)
        or h.counter_part_nick_name = (select nick from cur_nick)
        or exists (
          select 1 from binance_order_chat_messages m2
          where m2.order_number = h.order_number
            and m2.sender_is_self = false
            and m2.sender_nickname = (select nick from cur_nick)
        )
      )
  ),
  scoped as (
    select * from matches m
    where (p_exchange_account_id is null or m.exchange_account_id = p_exchange_account_id)
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
    select pay_method_name, count(*) c
    from scoped
    where pay_method_name is not null and pay_method_name <> ''
    group by 1 order by c desc limit 1
  )
  select
    (select cp_no from cp)::text,
    (select nick from cur_nick)::text,
    (select vn from cur)::text,
    count(*)::bigint,
    count(*) filter (where s.order_status = 'COMPLETED')::bigint,
    count(*) filter (where s.order_status in ('CANCELLED','CANCELLED_BY_SYSTEM'))::bigint,
    count(*) filter (where s.has_active_complaint is true or s.complaint_status is not null)::bigint,
    count(*) filter (where upper(coalesce(s.trade_type,'')) = 'BUY')::bigint,
    count(*) filter (where upper(coalesce(s.trade_type,'')) = 'SELL')::bigint,
    coalesce(sum(nullif(s.total_price,'')::numeric) filter (where s.order_status = 'COMPLETED'), 0)::numeric,
    coalesce(avg(nullif(s.total_price,'')::numeric) filter (where s.order_status = 'COMPLETED'), 0)::numeric,
    coalesce(percentile_cont(0.5) within group (order by nullif(s.total_price,'')::numeric)
               filter (where s.order_status = 'COMPLETED'), 0)::numeric,
    coalesce(sum(nullif(s.amount,'')::numeric) filter (where s.order_status = 'COMPLETED'), 0)::numeric,
    min(s.create_time)::bigint,
    max(s.create_time)::bigint,
    (select pay_method_name from paym)::text,
    (select round(avg(pay_min)::numeric, 1) from timings where pay_min is not null)::numeric,
    (select count(*)::bigint from timings where pay_min is not null),
    (select round(avg(rel_min)::numeric, 1) from timings where rel_min is not null)::numeric,
    (select count(*)::bigint from timings where rel_min is not null)
  from scoped s;
$function$;

REVOKE ALL ON FUNCTION public.get_counterparty_profile(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_counterparty_profile(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_counterparty_profile(text, uuid) TO service_role;