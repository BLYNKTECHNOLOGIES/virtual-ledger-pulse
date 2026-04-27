CREATE OR REPLACE FUNCTION public.terminal_order_has_active_appeal_evidence(p_order_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
      AND NOT public.terminal_order_is_final_status(h.order_status::text)
      AND (
        public.terminal_order_is_appeal_status(h.raw_data->>'orderStatus')
        OR public.terminal_order_is_appeal_status(h.raw_data->>'order_status')
        OR public.terminal_order_is_appeal_status(h.order_detail_raw->>'orderStatus')
        OR public.terminal_order_is_appeal_status(h.order_detail_raw->>'status')
        OR public.terminal_order_is_appeal_status(h.order_detail_raw->>'tradeStatus')
        OR coalesce(h.order_detail_raw->>'canCancelComplaintOrder', 'false') = 'true'
        OR (
          coalesce(h.order_detail_raw->>'complaintStatus', '') <> ''
          AND upper(coalesce(h.order_detail_raw->>'complaintStatus', '')) NOT IN ('0', '3', 'CLOSED', 'RESOLVED', 'CANCELLED', 'CANCELED')
        )
        OR coalesce(h.order_detail_raw->>'complaintReason', '') <> ''
      )
  )
$function$;

UPDATE public.terminal_appeal_cases c
SET status = public.terminal_order_final_appeal_status(public.get_authoritative_terminal_order_status(c.order_number)),
    binance_status = public.get_authoritative_terminal_order_status(c.order_number),
    updated_at = now()
WHERE c.source = 'binance_status'
  AND c.status NOT IN ('resolved', 'closed', 'cancelled')
  AND public.terminal_order_is_final_status(public.get_authoritative_terminal_order_status(c.order_number));