DROP FUNCTION IF EXISTS public.get_counterparty_order_history(text, uuid);

CREATE FUNCTION public.get_counterparty_order_history(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid)
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
  cur as (
    select order_detail_raw->>'merchantNo' as m,
           order_detail_raw->>'takerUserNo' as t
    from binance_order_history
    where order_number = p_order_number
    limit 1
  ),
  cp as (
    select case
      when (select m from cur) is not null
           and (select m from cur) not in (select merchant_no from self_nos)
        then (select m from cur)
      else (select t from cur)
    end as cp_no
  )
  select h.order_number, h.trade_type, h.asset, h.total_price, h.fiat_unit,
         h.create_time, h.exchange_account_id, h.order_status
  from binance_order_history h
  where (select cp_no from cp) is not null
    and h.order_number <> p_order_number
    and (p_exchange_account_id is null or h.exchange_account_id = p_exchange_account_id)
    and (
      case
        when (h.order_detail_raw->>'merchantNo') is not null
             and (h.order_detail_raw->>'merchantNo') not in (select merchant_no from self_nos)
          then h.order_detail_raw->>'merchantNo'
        else h.order_detail_raw->>'takerUserNo'
      end
    ) = (select cp_no from cp)
  order by h.create_time desc;
$function$;