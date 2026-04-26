ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_appeals_view';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_appeals_manage';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_appeals_request';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_appeals_toggle';

CREATE TABLE IF NOT EXISTS public.terminal_appeal_config (
  id boolean PRIMARY KEY DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_appeal_config_singleton CHECK (id = true)
);

INSERT INTO public.terminal_appeal_config (id, is_enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.terminal_appeal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'manual_request',
  status text NOT NULL DEFAULT 'requested',
  appeal_started_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  requested_from_case_id uuid REFERENCES public.terminal_small_payment_cases(id) ON DELETE SET NULL,
  request_reason text,
  adv_no text,
  trade_type text,
  asset text,
  fiat_unit text DEFAULT 'INR',
  total_price numeric,
  counterparty_nickname text,
  binance_status text,
  response_timer_minutes integer,
  response_due_at timestamptz,
  response_timer_set_by uuid,
  response_timer_set_at timestamptz,
  last_checked_in_at timestamptz,
  last_checked_in_by uuid,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terminal_appeal_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.terminal_appeal_cases(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  previous_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_appeal_cases_status ON public.terminal_appeal_cases(status);
CREATE INDEX IF NOT EXISTS idx_terminal_appeal_cases_started_at ON public.terminal_appeal_cases(appeal_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_appeal_cases_due_at ON public.terminal_appeal_cases(response_due_at);
CREATE INDEX IF NOT EXISTS idx_terminal_appeal_events_case_id ON public.terminal_appeal_case_events(case_id, created_at DESC);

ALTER TABLE public.terminal_appeal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_appeal_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_appeal_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appeal_config_read" ON public.terminal_appeal_config;
CREATE POLICY "appeal_config_read"
ON public.terminal_appeal_config
FOR SELECT
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_appeals_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_appeals_request')
  OR public.has_role(auth.uid(), 'Super Admin')
);

DROP POLICY IF EXISTS "appeal_cases_read" ON public.terminal_appeal_cases;
CREATE POLICY "appeal_cases_read"
ON public.terminal_appeal_cases
FOR SELECT
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_appeals_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_appeals_manage')
  OR public.has_role(auth.uid(), 'Super Admin')
);

DROP POLICY IF EXISTS "appeal_events_read" ON public.terminal_appeal_case_events;
CREATE POLICY "appeal_events_read"
ON public.terminal_appeal_case_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.terminal_appeal_cases c
    WHERE c.id = terminal_appeal_case_events.case_id
      AND (
        public.has_terminal_permission(auth.uid(), 'terminal_appeals_view')
        OR public.has_terminal_permission(auth.uid(), 'terminal_appeals_manage')
        OR public.has_role(auth.uid(), 'Super Admin')
      )
  )
);

CREATE OR REPLACE FUNCTION public.is_terminal_appeal_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_enabled FROM public.terminal_appeal_config WHERE id = true), false);
$$;

CREATE OR REPLACE FUNCTION public.set_terminal_appeal_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(v_actor, 'Super Admin') THEN
    RAISE EXCEPTION 'Only Super Admin can toggle the Appeal module';
  END IF;

  UPDATE public.terminal_appeal_config
  SET is_enabled = p_enabled,
      updated_by = v_actor,
      updated_at = now()
  WHERE id = true;

  RETURN p_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_terminal_appeal_case_event(
  p_case_id uuid,
  p_event_type text,
  p_new_value jsonb DEFAULT NULL,
  p_previous_value jsonb DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event_id uuid;
  v_order_number text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT order_number INTO v_order_number
  FROM public.terminal_appeal_cases
  WHERE id = p_case_id;

  IF v_order_number IS NULL THEN
    RAISE EXCEPTION 'Appeal case not found';
  END IF;

  IF NOT (
    public.has_terminal_permission(v_actor, 'terminal_appeals_manage')
    OR public.has_terminal_permission(v_actor, 'terminal_appeals_request')
    OR public.has_role(v_actor, 'Super Admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized for appeal event';
  END IF;

  INSERT INTO public.terminal_appeal_case_events (
    case_id, order_number, event_type, actor_user_id, previous_value, new_value, note
  ) VALUES (
    p_case_id, v_order_number, p_event_type, v_actor, p_previous_value, p_new_value, p_note
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

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

  SELECT status INTO v_existing_status
  FROM public.terminal_appeal_cases
  WHERE order_number = p_order_number;

  INSERT INTO public.terminal_appeal_cases (
    order_number, source, status, appeal_started_at, requested_by, requested_from_case_id,
    request_reason, adv_no, trade_type, asset, fiat_unit, total_price, counterparty_nickname,
    binance_status, notes, created_by, updated_by
  ) VALUES (
    p_order_number, p_source, p_status, now(),
    CASE WHEN p_source IN ('small_payment_request', 'manual_request') THEN v_actor ELSE NULL END,
    p_requested_from_case_id, p_request_reason, p_adv_no, p_trade_type, p_asset, p_fiat_unit,
    p_total_price, p_counterparty_nickname, p_binance_status, p_request_reason, v_actor, v_actor
  )
  ON CONFLICT (order_number) DO UPDATE SET
    source = CASE
      WHEN terminal_appeal_cases.source = 'binance_status' THEN terminal_appeal_cases.source
      WHEN EXCLUDED.source = 'binance_status' THEN 'binance_status'
      ELSE terminal_appeal_cases.source
    END,
    status = CASE
      WHEN terminal_appeal_cases.status IN ('resolved', 'closed', 'cancelled') THEN terminal_appeal_cases.status
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
    binance_status = COALESCE(EXCLUDED.binance_status, terminal_appeal_cases.binance_status),
    notes = COALESCE(EXCLUDED.notes, terminal_appeal_cases.notes),
    updated_by = v_actor,
    updated_at = now()
  RETURNING id INTO v_case_id;

  INSERT INTO public.terminal_appeal_case_events (
    case_id, order_number, event_type, actor_user_id, new_value, note
  ) VALUES (
    v_case_id,
    p_order_number,
    CASE WHEN p_source = 'binance_status' THEN 'binance_appeal_detected' WHEN v_existing_status IS NULL THEN 'requested' ELSE 'status_changed' END,
    v_actor,
    jsonb_build_object('source', p_source, 'status', p_status, 'binance_status', p_binance_status),
    p_request_reason
  );

  RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_terminal_appeal_from_small_payment(p_case_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case public.terminal_small_payment_cases%ROWTYPE;
  v_appeal_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_terminal_appeal_enabled() THEN
    RAISE EXCEPTION 'Appeal module is turned off';
  END IF;

  IF NOT (
    public.has_terminal_permission(v_actor, 'terminal_appeals_request')
    OR public.has_terminal_permission(v_actor, 'terminal_appeals_manage')
    OR public.has_role(v_actor, 'Super Admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to request appeal';
  END IF;

  SELECT * INTO v_case
  FROM public.terminal_small_payment_cases
  WHERE id = p_case_id
    AND (
      manager_user_id = v_actor
      OR payer_user_id = v_actor
      OR public.has_terminal_permission(v_actor, 'terminal_small_payments_manage')
      OR public.has_role(v_actor, 'Super Admin')
    );

  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'Small payment case not found or not authorized';
  END IF;

  SELECT public.upsert_terminal_appeal_case(
    v_case.order_number,
    'small_payment_request',
    'requested',
    p_reason,
    v_case.id,
    v_case.adv_no,
    NULL,
    v_case.asset,
    v_case.fiat_unit,
    v_case.total_price,
    v_case.counterparty_nickname,
    v_case.binance_status
  ) INTO v_appeal_id;

  UPDATE public.terminal_small_payment_cases
  SET status = 'appeal', updated_by = v_actor, updated_at = now()
  WHERE id = v_case.id;

  INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, new_value, note)
  VALUES (v_case.id, v_case.order_number, 'appeal_requested', v_actor, jsonb_build_object('appeal_case_id', v_appeal_id), p_reason);

  RETURN v_appeal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_terminal_appeal_response_timer(p_case_id uuid, p_minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to manage appeal timer';
  END IF;
  IF p_minutes IS NOT NULL AND p_minutes NOT IN (10, 30, 60, 120, 240, 480, 1440) THEN
    RAISE EXCEPTION 'Invalid response timer';
  END IF;

  SELECT jsonb_build_object('response_timer_minutes', response_timer_minutes, 'response_due_at', response_due_at)
  INTO v_previous
  FROM public.terminal_appeal_cases
  WHERE id = p_case_id;

  UPDATE public.terminal_appeal_cases
  SET response_timer_minutes = p_minutes,
      response_due_at = CASE WHEN p_minutes IS NULL THEN NULL ELSE now() + make_interval(mins => p_minutes) END,
      response_timer_set_by = v_actor,
      response_timer_set_at = now(),
      status = CASE WHEN status IN ('resolved','closed','cancelled') THEN status ELSE 'respond_by_set' END,
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Appeal case not found'; END IF;

  PERFORM public.log_terminal_appeal_case_event(
    p_case_id,
    'timer_set',
    jsonb_build_object('response_timer_minutes', p_minutes, 'response_due_at', CASE WHEN p_minutes IS NULL THEN NULL ELSE now() + make_interval(mins => p_minutes) END),
    v_previous,
    CASE WHEN p_minutes IS NULL THEN 'No timer selected' ELSE concat('Response timer set for ', p_minutes, ' minutes') END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_terminal_appeal_case(p_case_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to check in appeal';
  END IF;

  UPDATE public.terminal_appeal_cases
  SET last_checked_in_at = now(),
      last_checked_in_by = v_actor,
      notes = COALESCE(NULLIF(p_note, ''), notes),
      status = CASE WHEN status IN ('resolved','closed','cancelled') THEN status ELSE 'checked_in' END,
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Appeal case not found'; END IF;

  PERFORM public.log_terminal_appeal_case_event(p_case_id, 'checked_in', jsonb_build_object('checked_in_at', now()), NULL, p_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_terminal_appeal_note(p_case_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN RAISE EXCEPTION 'Note is required'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to add appeal note';
  END IF;

  UPDATE public.terminal_appeal_cases
  SET notes = p_note,
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Appeal case not found'; END IF;

  PERFORM public.log_terminal_appeal_case_event(p_case_id, 'note_added', NULL, NULL, p_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_terminal_appeal_status(p_case_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to update appeal status';
  END IF;
  IF p_status NOT IN ('requested', 'under_appeal', 'respond_by_set', 'checked_in', 'resolved', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid appeal status';
  END IF;

  SELECT status INTO v_previous FROM public.terminal_appeal_cases WHERE id = p_case_id;

  UPDATE public.terminal_appeal_cases
  SET status = p_status,
      notes = COALESCE(NULLIF(p_note, ''), notes),
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Appeal case not found'; END IF;

  PERFORM public.log_terminal_appeal_case_event(
    p_case_id,
    CASE WHEN p_status IN ('resolved','closed') THEN p_status ELSE 'status_changed' END,
    jsonb_build_object('status', p_status),
    jsonb_build_object('status', v_previous),
    p_note
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_terminal_appeal_config_updated_at ON public.terminal_appeal_config;
    CREATE TRIGGER trg_terminal_appeal_config_updated_at
    BEFORE UPDATE ON public.terminal_appeal_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS trg_terminal_appeal_cases_updated_at ON public.terminal_appeal_cases;
    CREATE TRIGGER trg_terminal_appeal_cases_updated_at
    BEFORE UPDATE ON public.terminal_appeal_cases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;