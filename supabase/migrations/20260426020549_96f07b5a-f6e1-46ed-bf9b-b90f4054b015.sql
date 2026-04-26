CREATE OR REPLACE FUNCTION public.terminal_order_is_final_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(coalesce(p_status, '')) LIKE '%COMPLETED%'
      OR upper(coalesce(p_status, '')) LIKE '%CANCEL%'
      OR upper(coalesce(p_status, '')) LIKE '%EXPIRED%'
      OR upper(coalesce(p_status, '')) LIKE '%TIMEOUT%'
$$;

CREATE OR REPLACE FUNCTION public.terminal_order_final_appeal_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_status, '')) LIKE '%COMPLETED%' THEN 'resolved'
    WHEN public.terminal_order_is_final_status(p_status) THEN 'cancelled'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.get_authoritative_terminal_order_status(p_order_number text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM (
    SELECT h.order_status::text AS status, 1 AS priority, h.synced_at AS ts
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
      AND public.terminal_order_is_final_status(h.order_status::text)
    UNION ALL
    SELECT p.order_status::text AS status, 2 AS priority, p.synced_at AS ts
    FROM public.p2p_order_records p
    WHERE p.binance_order_number = p_order_number
      AND public.terminal_order_is_final_status(p.order_status::text)
  ) s
  ORDER BY priority, ts DESC NULLS LAST
  LIMIT 1
$$;

WITH terminal_cases AS (
  SELECT
    c.id,
    c.order_number,
    c.status AS previous_status,
    c.binance_status AS previous_binance_status,
    public.get_authoritative_terminal_order_status(c.order_number) AS final_status
  FROM public.terminal_appeal_cases c
  WHERE c.status NOT IN ('resolved', 'closed', 'cancelled')
), updated AS (
  UPDATE public.terminal_appeal_cases c
  SET
    status = public.terminal_order_final_appeal_status(t.final_status),
    binance_status = t.final_status,
    notes = COALESCE(c.notes, 'Automatically moved to appeal history because authoritative order status is final.'),
    updated_at = now()
  FROM terminal_cases t
  WHERE c.id = t.id
    AND t.final_status IS NOT NULL
    AND public.terminal_order_final_appeal_status(t.final_status) IS NOT NULL
  RETURNING c.id, c.order_number, t.previous_status, t.previous_binance_status, c.status AS new_status, c.binance_status AS new_binance_status
)
INSERT INTO public.terminal_appeal_case_events (
  case_id,
  order_number,
  event_type,
  actor_user_id,
  previous_value,
  new_value,
  note
)
SELECT
  id,
  order_number,
  'auto_finalized_from_authoritative_order_status',
  NULL,
  jsonb_build_object('status', previous_status, 'binance_status', previous_binance_status),
  jsonb_build_object('status', new_status, 'binance_status', new_binance_status),
  'Moved out of active Appeal view because order history/terminal records show a final order status.'
FROM updated;

CREATE OR REPLACE FUNCTION public.upsert_terminal_appeal_case(
  p_order_number text,
  p_source text DEFAULT 'manual_request',
  p_status text DEFAULT 'requested',
  p_request_reason text DEFAULT NULL,
  p_requested_from_case_id uuid DEFAULT NULL,
  p_adv_no text DEFAULT NULL,
  p_trade_type text DEFAULT NULL,
  p_asset text DEFAULT NULL,
  p_fiat_unit text DEFAULT 'INR',
  p_total_price numeric DEFAULT NULL,
  p_counterparty_nickname text DEFAULT NULL,
  p_binance_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_existing_status text;
  v_authoritative_status text;
  v_effective_status text := p_status;
  v_effective_binance_status text := p_binance_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_terminal_appeal_enabled() THEN
    RAISE EXCEPTION 'Appeal module is turned off';
  END IF;

  IF p_order_number IS NULL OR btrim(p_order_number) = '' THEN
    RAISE EXCEPTION 'Order number is required';
  END IF;

  IF p_source NOT IN ('binance_status', 'small_payment_request', 'manual_request') THEN
    RAISE EXCEPTION 'Invalid appeal source';
  END IF;

  IF p_status NOT IN ('requested', 'under_appeal', 'respond_by_set', 'checked_in', 'resolved', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid appeal status';
  END IF;

  IF p_source = 'small_payment_request' OR p_source = 'manual_request' THEN
    IF NOT (
      public.has_terminal_permission(v_actor, 'terminal_appeals_request')
      OR public.has_terminal_permission(v_actor, 'terminal_appeals_manage')
      OR public.has_role(v_actor, 'Super Admin')
    ) THEN
      RAISE EXCEPTION 'Not authorized to request appeal';
    END IF;
  ELSE
    IF NOT (
      public.has_terminal_permission(v_actor, 'terminal_appeals_manage')
      OR public.has_role(v_actor, 'Super Admin')
    ) THEN
      RAISE EXCEPTION 'Not authorized to sync appeal';
    END IF;
  END IF;

  SELECT public.get_authoritative_terminal_order_status(p_order_number) INTO v_authoritative_status;
  IF v_authoritative_status IS NOT NULL THEN
    v_effective_status := public.terminal_order_final_appeal_status(v_authoritative_status);
    v_effective_binance_status := v_authoritative_status;
  END IF;

  SELECT status INTO v_existing_status
  FROM public.terminal_appeal_cases
  WHERE order_number = p_order_number;

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
    source = CASE
      WHEN terminal_appeal_cases.source = 'binance_status' THEN terminal_appeal_cases.source
      WHEN EXCLUDED.source = 'binance_status' THEN 'binance_status'
      ELSE terminal_appeal_cases.source
    END,
    status = CASE
      WHEN terminal_appeal_cases.status IN ('resolved', 'closed', 'cancelled') THEN terminal_appeal_cases.status
      WHEN public.terminal_order_is_final_status(v_authoritative_status) THEN v_effective_status
      WHEN EXCLUDED.status = 'under_appeal' THEN 'under_appeal'
      ELSE terminal_appeal_cases.status
    END,
    requested_by = COALESCE(terminal_appeal_cases.requested_by, EXCLUDED.requested_by),
    requested_from_case_id = COALESCE(terminal_appeal_cases.requested_from_case_id, EXCLUDED.requested_from_case_id),
    request_reason = COALESCE(EXCLUDED.request_reason, terminal_appeal_cases.request_reason),
    adv_no = COALESCE(EXCLUDED.adv_no, terminal_appeal_cases.adv_no),
    trade_type = COALESCE(EXCLUDED.trade_type, terminal_appeal_cases.trade_type),
    asset = COALESCE(EXCLUDED.asset, terminal_appeal_cases.asset),
    fiat_unit = COALESCE(EXCLUDED.fiat_unit, terminal_appeal_cases.fiat_unit),
    total_price = COALESCE(EXCLUDED.total_price, terminal_appeal_cases.total_price),
    counterparty_nickname = COALESCE(EXCLUDED.counterparty_nickname, terminal_appeal_cases.counterparty_nickname),
    binance_status = COALESCE(v_effective_binance_status, EXCLUDED.binance_status, terminal_appeal_cases.binance_status),
    notes = COALESCE(EXCLUDED.notes, terminal_appeal_cases.notes),
    updated_by = v_actor,
    updated_at = now()
  RETURNING id INTO v_case_id;

  INSERT INTO public.terminal_appeal_case_events (
    case_id, order_number, event_type, actor_user_id, new_value, note
  ) VALUES (
    v_case_id,
    p_order_number,
    CASE
      WHEN v_authoritative_status IS NOT NULL THEN 'authoritative_final_status_detected'
      WHEN p_source = 'binance_status' THEN 'binance_appeal_detected'
      WHEN v_existing_status IS NULL THEN 'requested'
      ELSE 'status_changed'
    END,
    v_actor,
    jsonb_build_object('source', p_source, 'status', v_effective_status, 'binance_status', v_effective_binance_status, 'authoritative_status', v_authoritative_status),
    p_request_reason
  );

  RETURN v_case_id;
END;
$$;