CREATE OR REPLACE FUNCTION public.get_counterparty_order_history(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_number text, trade_type text, asset text, total_price text, fiat_unit text, create_time bigint, exchange_account_id uuid, order_status text)
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
    -- our own nicknames: appear on many orders as one side
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
           order_detail_raw->>'takerUserNo' as t
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
  -- fallback identity: the counterparty's real (unmasked) nickname
  cur_nick as (
    select nick from (
      select order_detail_raw->>'buyerNickname' as nick
      from binance_order_history where binance_order_history.order_number = p_order_number
      union all
      select order_detail_raw->>'sellerNickname'
      from binance_order_history where binance_order_history.order_number = p_order_number
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
    select h.order_number, h.trade_type, h.asset, h.total_price, h.fiat_unit,
           h.create_time, h.exchange_account_id, h.order_status
    from binance_order_history h
    where (select cp_no from cp) is not null
      and h.order_number <> p_order_number
      and (
        case
          when (h.order_detail_raw->>'merchantNo') is not null
               and (h.order_detail_raw->>'merchantNo') not in (select merchant_no from self_nos)
            then h.order_detail_raw->>'merchantNo'
          else h.order_detail_raw->>'takerUserNo'
        end
      ) = (select cp_no from cp)

    union

    select h.order_number, h.trade_type, h.asset, h.total_price, h.fiat_unit,
           h.create_time, h.exchange_account_id, h.order_status
    from binance_order_history h
    where (select nick from cur_nick) is not null
      and h.order_number <> p_order_number
      and (
        h.order_detail_raw->>'buyerNickname' = (select nick from cur_nick)
        or h.order_detail_raw->>'sellerNickname' = (select nick from cur_nick)
        or exists (
          select 1 from binance_order_chat_messages m2
          where m2.order_number = h.order_number
            and m2.sender_is_self = false
            and m2.sender_nickname = (select nick from cur_nick)
        )
      )
  )
  select m.order_number, m.trade_type, m.asset, m.total_price, m.fiat_unit,
         m.create_time, m.exchange_account_id, m.order_status
  from matches m
  where (p_exchange_account_id is null or m.exchange_account_id = p_exchange_account_id)
  order by m.create_time desc;
$function$;