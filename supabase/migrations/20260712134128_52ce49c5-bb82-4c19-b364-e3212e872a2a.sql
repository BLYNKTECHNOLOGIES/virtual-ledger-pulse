
CREATE OR REPLACE FUNCTION public.get_counterparty_completed_order_count(
  p_order_number text,
  p_cp_userno text DEFAULT NULL,
  p_exchange_account_id uuid DEFAULT NULL
)
RETURNS integer
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
    select coalesce(
      nullif(trim(p_cp_userno), ''),
      (select cp_userno from cp_order_identity where order_number = p_order_number and cp_userno is not null limit 1),
      case
        when (select m from cur) is not null
             and (select m from cur) not in (select merchant_no from self_nos)
          then (select m from cur)
        else (select t from cur)
      end
    ) as cp_no
  )
  select coalesce(count(*), 0)::int
  from binance_order_history h
  where (select cp_no from cp) is not null
    and h.order_status = 'COMPLETED'
    and h.order_number <> p_order_number
    and (p_exchange_account_id is null or h.exchange_account_id = p_exchange_account_id)
    and (
      case
        when (h.order_detail_raw->>'merchantNo') is not null
             and (h.order_detail_raw->>'merchantNo') not in (select merchant_no from self_nos)
          then h.order_detail_raw->>'merchantNo'
        else h.order_detail_raw->>'takerUserNo'
      end
    ) = (select cp_no from cp);
$function$;

GRANT EXECUTE ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid) TO authenticated, service_role;
