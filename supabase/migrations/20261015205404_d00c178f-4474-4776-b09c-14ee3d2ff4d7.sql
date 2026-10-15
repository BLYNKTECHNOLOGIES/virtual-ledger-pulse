-- TD-FIX-A (F4): bounded server-side re-check of open orders older than 24 h.
CREATE TABLE public.binance_open_order_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  order_number text NOT NULL,
  exchange_account_id uuid,
  trade_type text,
  status_before text,
  status_after text,
  source text,            -- 'history' | 'detail' | null
  raw_code text,          -- raw Binance orderStatus when source = 'detail'
  outcome text NOT NULL,  -- changed | unchanged | not_returned | account_mismatch | account_unavailable | superseded | error
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_open_order_checks_order ON public.binance_open_order_checks(order_number, checked_at DESC);
CREATE INDEX idx_open_order_checks_time ON public.binance_open_order_checks(checked_at DESC);
GRANT SELECT ON public.binance_open_order_checks TO authenticated;
GRANT ALL ON public.binance_open_order_checks TO service_role;
ALTER TABLE public.binance_open_order_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Terminal users read open-order checks" ON public.binance_open_order_checks
  FOR SELECT TO authenticated USING (public.verify_terminal_access(auth.uid()));

CREATE TABLE public.binance_open_order_refresh_state (
  order_number text PRIMARY KEY,
  exchange_account_id uuid,
  last_checked_at timestamptz NOT NULL,
  next_check_at timestamptz NOT NULL,
  last_outcome text NOT NULL,
  changed_at timestamptz,
  status_after text,
  completed_by_refresher_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.binance_open_order_refresh_state TO authenticated;
GRANT ALL ON public.binance_open_order_refresh_state TO service_role;
ALTER TABLE public.binance_open_order_refresh_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read open-order refresh state" ON public.binance_open_order_refresh_state
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.binance_order_status_is_final(p_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(coalesce(p_status,'')) IN ('COMPLETED','CANCELLED','CANCELLED_BY_SYSTEM','RELEASED','EXPIRED')
$$;

-- Candidates: open rows, 24 h < age <= 1 y, not checked inside their back-off,
-- oldest-checked first, at most p_per_account per account.
CREATE OR REPLACE FUNCTION public.select_stale_open_orders(p_now_ms bigint, p_per_account integer)
RETURNS TABLE(order_number text, exchange_account_id uuid, trade_type text, order_status text, create_time bigint, last_checked_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT order_number, exchange_account_id, trade_type, order_status, create_time, last_checked_at FROM (
    SELECT h.order_number, h.exchange_account_id, h.trade_type, h.order_status, h.create_time, s.last_checked_at,
      row_number() OVER (PARTITION BY h.exchange_account_id
                         ORDER BY s.last_checked_at ASC NULLS FIRST, h.create_time ASC) AS rn
    FROM public.binance_order_history h
    LEFT JOIN public.binance_open_order_refresh_state s ON s.order_number = h.order_number
    WHERE NOT public.binance_order_status_is_final(h.order_status)
      AND h.create_time < p_now_ms - 86400000::bigint
      AND h.create_time >= p_now_ms - 365::bigint * 86400000
      AND (s.next_check_at IS NULL OR s.next_check_at <= to_timestamp(p_now_ms / 1000.0))
  ) q WHERE rn <= greatest(p_per_account, 0)
$$;

-- Record one check atomically. Writes a status only if p_status is given and the
-- row is still open at write time (a final status written by anything else wins).
CREATE OR REPLACE FUNCTION public.apply_open_order_check(
  p_run_id uuid, p_order_number text, p_outcome text, p_source text, p_raw_code text, p_message text,
  p_status text, p_complaint_status text, p_has_active_complaint boolean, p_raw_data jsonb, p_detail_raw jsonb,
  p_backoff_minutes integer)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_row public.binance_order_history%ROWTYPE;
  v_outcome text := p_outcome;
  v_after text;
  v_n integer;
  v_bucket bigint;
BEGIN
  SELECT * INTO v_row FROM public.binance_order_history WHERE order_number = p_order_number;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  v_after := v_row.order_status;

  IF p_status IS NOT NULL THEN
    IF upper(p_status) = upper(coalesce(v_row.order_status,'')) THEN
      v_outcome := 'unchanged';
      UPDATE public.binance_order_history SET synced_at = now(),
        complaint_status = coalesce(p_complaint_status, complaint_status),
        has_active_complaint = coalesce(p_has_active_complaint, has_active_complaint)
      WHERE order_number = p_order_number AND NOT public.binance_order_status_is_final(order_status);
    ELSE
      UPDATE public.binance_order_history SET
        order_status = p_status,
        complaint_status = p_complaint_status,
        has_active_complaint = coalesce(p_has_active_complaint, false),
        raw_data = coalesce(p_raw_data, raw_data),
        order_detail_raw = coalesce(p_detail_raw, order_detail_raw),
        synced_at = now()
      WHERE order_number = p_order_number AND NOT public.binance_order_status_is_final(order_status);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        v_outcome := 'superseded';
        SELECT order_status INTO v_after FROM public.binance_order_history WHERE order_number = p_order_number;
      ELSE
        v_outcome := 'changed';
        v_after := p_status;
        UPDATE public.p2p_order_records SET
          order_status = p_status, synced_at = now(),
          completed_at = CASE WHEN upper(p_status) = 'COMPLETED' THEN coalesce(completed_at, now()) ELSE completed_at END,
          cancelled_at = CASE WHEN upper(p_status) IN ('CANCELLED','CANCELLED_BY_SYSTEM','EXPIRED') THEN coalesce(cancelled_at, now()) ELSE cancelled_at END
        WHERE binance_order_number = p_order_number;
        v_bucket := floor(v_row.create_time / 1800000.0)::bigint * 1800000;
        PERFORM public.rebuild_terminal_order_rollups(v_bucket, v_bucket + 1800000);
      END IF;
    END IF;
  END IF;

  INSERT INTO public.binance_open_order_checks(run_id, order_number, exchange_account_id, trade_type,
    status_before, status_after, source, raw_code, outcome, message)
  VALUES (p_run_id, p_order_number, v_row.exchange_account_id, v_row.trade_type,
    v_row.order_status, v_after, p_source, p_raw_code, v_outcome, left(p_message, 500));

  INSERT INTO public.binance_open_order_refresh_state AS s (order_number, exchange_account_id, last_checked_at,
    next_check_at, last_outcome, changed_at, status_after, completed_by_refresher_at, updated_at)
  VALUES (p_order_number, v_row.exchange_account_id, now(), now() + make_interval(mins => greatest(p_backoff_minutes, 15)),
    v_outcome, CASE WHEN v_outcome = 'changed' THEN now() END, v_after,
    CASE WHEN v_outcome = 'changed' AND upper(v_after) = 'COMPLETED' THEN now() END, now())
  ON CONFLICT (order_number) DO UPDATE SET
    exchange_account_id = EXCLUDED.exchange_account_id,
    last_checked_at = EXCLUDED.last_checked_at,
    next_check_at = EXCLUDED.next_check_at,
    last_outcome = EXCLUDED.last_outcome,
    changed_at = coalesce(EXCLUDED.changed_at, s.changed_at),
    status_after = EXCLUDED.status_after,
    completed_by_refresher_at = coalesce(EXCLUDED.completed_by_refresher_at, s.completed_by_refresher_at),
    updated_at = now();
  RETURN v_outcome;
END $$;

-- ERP signal: orders this refresher moved to COMPLETED since p_since (RLS of the history table applies).
CREATE OR REPLACE FUNCTION public.refresher_completed_orders(p_trade_type text, p_since timestamptz)
RETURNS SETOF public.binance_order_history
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT h.* FROM public.binance_order_history h
  JOIN public.binance_open_order_refresh_state s ON s.order_number = h.order_number
  WHERE s.completed_by_refresher_at >= p_since
    AND upper(h.order_status) = 'COMPLETED'
    AND upper(h.trade_type) = upper(p_trade_type)
$$;

REVOKE ALL ON FUNCTION public.select_stale_open_orders(bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_open_order_check(uuid, text, text, text, text, text, text, text, boolean, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_stale_open_orders(bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_open_order_check(uuid, text, text, text, text, text, text, text, boolean, jsonb, jsonb, integer) TO service_role;
REVOKE ALL ON FUNCTION public.refresher_completed_orders(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresher_completed_orders(text, timestamptz) TO authenticated, service_role;