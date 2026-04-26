CREATE OR REPLACE FUNCTION public.upsert_terminal_appeal_case(
  p_order_number text,
  p_source text DEFAULT 'manual_request'::text,
  p_status text DEFAULT 'requested'::text,
  p_request_reason text DEFAULT NULL::text,
  p_requested_from_case_id uuid DEFAULT NULL::uuid,
  p_adv_no text DEFAULT NULL::text,
  p_trade_type text DEFAULT NULL::text,
  p_asset text DEFAULT NULL::text,
  p_fiat_unit text DEFAULT 'INR'::text,
  p_total_price numeric DEFAULT NULL::numeric,
  p_counterparty_nickname text DEFAULT NULL::text,
  p_binance_status text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_existing_status text;
  v_authoritative_status text;
  v_effective_status text := p_status;
  v_effective_binance_status text := p_binance_status;
  v_has_active_complaint boolean := false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF p_order_number IS NULL OR btrim(p_order_number) = '' THEN RAISE EXCEPTION 'Order number is required'; END IF;
  IF p_source NOT IN ('binance_status', 'small_payment_request', 'manual_request') THEN RAISE EXCEPTION 'Invalid appeal source'; END IF;
  IF p_status NOT IN ('requested', 'under_appeal', 'respond_by_set', 'checked_in', 'resolved', 'closed', 'cancelled') THEN RAISE EXCEPTION 'Invalid appeal status'; END IF;

  IF p_source = 'small_payment_request' OR p_source = 'manual_request' THEN
    IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_request') OR public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
      RAISE EXCEPTION 'Not authorized to request appeal';
    END IF;
  ELSE
    IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
      RAISE EXCEPTION 'Not authorized to sync appeal';
    END IF;
  END IF;

  SELECT public.get_authoritative_terminal_order_status(p_order_number) INTO v_authoritative_status;

  SELECT EXISTS (
    SELECT 1
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
      AND (
        public.terminal_order_is_appeal_status(h.raw_data->>'orderStatus')
        OR public.terminal_order_is_appeal_status(h.raw_data->>'order_status')
        OR public.terminal_order_is_appeal_status(h.order_status)
        OR coalesce(h.order_detail_raw->>'complaintReason', '') <> ''
        OR coalesce(h.order_detail_raw->>'canCancelComplaintOrder', 'false') = 'true'
        OR (
          coalesce(h.order_detail_raw->>'complaintStatus', '') <> ''
          AND upper(coalesce(h.order_detail_raw->>'complaintStatus', '')) NOT IN ('0', '3', 'CLOSED', 'RESOLVED', 'CANCELLED', 'CANCELED')
        )
      )
  ) INTO v_has_active_complaint;

  IF NOT v_has_active_complaint AND public.terminal_order_is_final_status(v_authoritative_status) AND upper(coalesce(v_authoritative_status, '')) LIKE '%CANCEL%' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.terminal_appeal_cases c
      WHERE c.order_number = p_order_number
        AND c.source = 'binance_status'
        AND (
          c.status IN ('under_appeal', 'respond_by_set', 'checked_in')
          OR EXISTS (
            SELECT 1 FROM public.terminal_appeal_case_events e
            WHERE e.case_id = c.id
              AND e.event_type IN ('active_complaint_evidence_detected', 'timer_set', 'checked_in')
          )
        )
    ) INTO v_has_active_complaint;
  END IF;

  IF public.terminal_order_is_final_status(v_authoritative_status) AND p_status IN ('resolved', 'closed', 'cancelled') AND NOT v_has_active_complaint THEN
    v_effective_status := COALESCE(public.terminal_order_final_appeal_status(v_authoritative_status), p_status);
    v_effective_binance_status := v_authoritative_status;
  ELSIF public.terminal_order_is_final_status(v_authoritative_status) AND p_source = 'binance_status' AND p_status = 'under_appeal' AND v_has_active_complaint THEN
    v_effective_status := 'under_appeal';
    v_effective_binance_status := v_authoritative_status;
  ELSIF public.terminal_order_is_final_status(v_authoritative_status) AND p_source = 'binance_status' AND p_status = 'under_appeal' THEN
    v_effective_status := COALESCE(public.terminal_order_final_appeal_status(v_authoritative_status), 'cancelled');
    v_effective_binance_status := v_authoritative_status;
  ELSIF v_authoritative_status IS NOT NULL THEN
    v_effective_binance_status := v_authoritative_status;
  END IF;

  SELECT status INTO v_existing_status FROM public.terminal_appeal_cases WHERE order_number = p_order_number;

  INSERT INTO public.terminal_appeal_cases (
    order_number, source, status, appeal_started_at, requested_by, requested_from_case_id,
    request_reason, adv_no, trade_type, asset, fiat_unit, total_price, counterparty_nickname,
    binance_status, notes, created_by, updated_by
  ) VALUES (
    p_order_number, p_source, v_effective_status, now(),
    CASE WHEN p_source IN ('small_payment_request', 'manual_request') THEN v_actor ELSE NULL END,
    p_requested_from_case_id, p_request_reason, p_adv_no, p_trade_type, p_asset, p_fiat_unit,
    p_total_price, p_counterparty_nickname, v_effective_binance_status, p_request_reason, v_actor, v_actor
  )
  ON CONFLICT (order_number) DO UPDATE SET
    source = CASE WHEN terminal_appeal_cases.source = 'small_payment_request' THEN terminal_appeal_cases.source ELSE EXCLUDED.source END,
    status = CASE
      WHEN terminal_appeal_cases.status IN ('resolved', 'closed', 'cancelled') AND NOT v_has_active_complaint THEN terminal_appeal_cases.status
      WHEN public.terminal_order_is_final_status(v_authoritative_status) THEN v_effective_status
      ELSE EXCLUDED.status
    END,
    request_reason = COALESCE(EXCLUDED.request_reason, terminal_appeal_cases.request_reason),
    adv_no = COALESCE(EXCLUDED.adv_no, terminal_appeal_cases.adv_no),
    trade_type = COALESCE(EXCLUDED.trade_type, terminal_appeal_cases.trade_type),
    asset = COALESCE(EXCLUDED.asset, terminal_appeal_cases.asset),
    fiat_unit = COALESCE(EXCLUDED.fiat_unit, terminal_appeal_cases.fiat_unit),
    total_price = COALESCE(EXCLUDED.total_price, terminal_appeal_cases.total_price),
    counterparty_nickname = COALESCE(EXCLUDED.counterparty_nickname, terminal_appeal_cases.counterparty_nickname),
    binance_status = COALESCE(EXCLUDED.binance_status, terminal_appeal_cases.binance_status),
    notes = COALESCE(EXCLUDED.notes, terminal_appeal_cases.notes),
    updated_by = v_actor,
    updated_at = now()
  RETURNING id INTO v_case_id;

  IF v_existing_status IS DISTINCT FROM v_effective_status THEN
    INSERT INTO public.terminal_appeal_case_events (case_id, event_type, actor_user_id, note, previous_value, new_value)
    VALUES (v_case_id, 'status_changed', v_actor, p_request_reason, jsonb_build_object('from_status', v_existing_status), jsonb_build_object('to_status', v_effective_status, 'binance_status', v_effective_binance_status));
  END IF;

  RETURN v_case_id;
END;
$function$;

WITH latest_timer AS (
  SELECT DISTINCT ON (e.case_id)
    e.case_id,
    (e.new_value->>'response_timer_minutes')::integer AS response_timer_minutes,
    (e.new_value->>'response_due_at')::timestamptz AS response_due_at,
    e.actor_user_id,
    e.created_at
  FROM public.terminal_appeal_case_events e
  WHERE e.event_type = 'timer_set'
  ORDER BY e.case_id, e.created_at DESC
), cancelled_under_appeal AS (
  SELECT c.id
  FROM public.terminal_appeal_cases c
  WHERE c.status = 'cancelled'
    AND c.source = 'binance_status'
    AND public.terminal_order_is_final_status(public.get_authoritative_terminal_order_status(c.order_number))
    AND upper(coalesce(public.get_authoritative_terminal_order_status(c.order_number), '')) LIKE '%CANCEL%'
    AND EXISTS (
      SELECT 1 FROM public.terminal_appeal_case_events e
      WHERE e.case_id = c.id
        AND e.event_type IN ('active_complaint_evidence_detected', 'timer_set', 'checked_in')
    )
)
UPDATE public.terminal_appeal_cases c
SET status = CASE WHEN lt.response_timer_minutes IS NOT NULL THEN 'respond_by_set' ELSE 'under_appeal' END,
    response_timer_minutes = lt.response_timer_minutes,
    response_due_at = lt.response_due_at,
    response_timer_set_by = lt.actor_user_id,
    response_timer_set_at = lt.created_at,
    updated_at = now()
FROM cancelled_under_appeal a
LEFT JOIN latest_timer lt ON lt.case_id = a.id
WHERE c.id = a.id;