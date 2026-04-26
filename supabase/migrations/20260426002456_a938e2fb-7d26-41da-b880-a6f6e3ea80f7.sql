ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_small_payments_view';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_small_payments_manage';

CREATE TABLE IF NOT EXISTS public.terminal_small_payment_manager_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('size_range', 'ad_id')),
  size_range_id uuid REFERENCES public.terminal_order_size_ranges(id) ON DELETE CASCADE,
  ad_id text,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_small_payment_manager_assignments_target_check CHECK (
    (assignment_type = 'size_range' AND size_range_id IS NOT NULL AND ad_id IS NULL)
    OR
    (assignment_type = 'ad_id' AND ad_id IS NOT NULL AND size_range_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tspma_unique_active_range
  ON public.terminal_small_payment_manager_assignments (manager_user_id, size_range_id)
  WHERE is_active = true AND assignment_type = 'size_range';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tspma_unique_active_ad
  ON public.terminal_small_payment_manager_assignments (manager_user_id, ad_id)
  WHERE is_active = true AND assignment_type = 'ad_id';

CREATE INDEX IF NOT EXISTS idx_tspma_manager_active
  ON public.terminal_small_payment_manager_assignments (manager_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tspma_range_active
  ON public.terminal_small_payment_manager_assignments (size_range_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tspma_ad_active
  ON public.terminal_small_payment_manager_assignments (ad_id, is_active);

CREATE TABLE IF NOT EXISTS public.terminal_small_payment_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  case_type text NOT NULL DEFAULT 'post_payment_followup' CHECK (case_type IN (
    'post_payment_followup',
    'alternate_upi_needed',
    'payment_not_received',
    'awaiting_refund',
    'invalid_upi',
    'unresponsive_counterparty',
    'appeal_risk',
    'other'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'waiting_counterparty',
    'awaiting_refund',
    'ready_to_repay',
    'resolved',
    'closed',
    'cancelled',
    'appeal'
  )),
  payer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  manager_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  marked_paid_at timestamptz,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_contacted_at timestamptz,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  created_from text NOT NULL DEFAULT 'manual' CHECK (created_from IN ('marked_paid', 'alt_upi', 'manual_tag', 'manual', 'reconciliation')),
  adv_no text,
  total_price numeric,
  asset text,
  fiat_unit text DEFAULT 'INR',
  counterparty_nickname text,
  binance_status text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tspc_one_active_case_per_order
  ON public.terminal_small_payment_cases (order_number)
  WHERE status NOT IN ('resolved', 'closed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_tspc_manager_status_opened
  ON public.terminal_small_payment_cases (manager_user_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_tspc_payer_opened
  ON public.terminal_small_payment_cases (payer_user_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_tspc_order_number
  ON public.terminal_small_payment_cases (order_number);

CREATE INDEX IF NOT EXISTS idx_tspc_case_type_status
  ON public.terminal_small_payment_cases (case_type, status);

CREATE INDEX IF NOT EXISTS idx_tspc_marked_paid_at
  ON public.terminal_small_payment_cases (marked_paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_tspc_tags
  ON public.terminal_small_payment_cases USING gin (tags);

CREATE TABLE IF NOT EXISTS public.terminal_small_payment_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.terminal_small_payment_cases(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created',
    'assigned',
    'tag_changed',
    'status_changed',
    'priority_changed',
    'note_added',
    'contacted',
    'checked',
    'resolved',
    'closed',
    'reopened'
  )),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  previous_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tspce_case_created
  ON public.terminal_small_payment_case_events (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tspce_order_created
  ON public.terminal_small_payment_case_events (order_number, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_terminal_small_payment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tspma_updated_at ON public.terminal_small_payment_manager_assignments;
CREATE TRIGGER trg_tspma_updated_at
BEFORE UPDATE ON public.terminal_small_payment_manager_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_terminal_small_payment_updated_at();

DROP TRIGGER IF EXISTS trg_tspc_updated_at ON public.terminal_small_payment_cases;
CREATE TRIGGER trg_tspc_updated_at
BEFORE UPDATE ON public.terminal_small_payment_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_terminal_small_payment_updated_at();

ALTER TABLE public.terminal_small_payment_manager_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_small_payment_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_small_payment_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "small_payment_assignments_read" ON public.terminal_small_payment_manager_assignments;
CREATE POLICY "small_payment_assignments_read"
ON public.terminal_small_payment_manager_assignments
FOR SELECT
TO authenticated
USING (
  manager_user_id = auth.uid()
  OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_users_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage')
);

DROP POLICY IF EXISTS "small_payment_assignments_manage" ON public.terminal_small_payment_manager_assignments;
CREATE POLICY "small_payment_assignments_manage"
ON public.terminal_small_payment_manager_assignments
FOR ALL
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage')
)
WITH CHECK (
  public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_users_manage')
);

DROP POLICY IF EXISTS "small_payment_cases_read" ON public.terminal_small_payment_cases;
CREATE POLICY "small_payment_cases_read"
ON public.terminal_small_payment_cases
FOR SELECT
TO authenticated
USING (
  payer_user_id = auth.uid()
  OR manager_user_id = auth.uid()
  OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_payer_view')
);

DROP POLICY IF EXISTS "small_payment_cases_create" ON public.terminal_small_payment_cases;
CREATE POLICY "small_payment_cases_create"
ON public.terminal_small_payment_cases
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_terminal_permission(auth.uid(), 'terminal_payer_view')
    OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
    OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_view')
  )
);

DROP POLICY IF EXISTS "small_payment_cases_update" ON public.terminal_small_payment_cases;
CREATE POLICY "small_payment_cases_update"
ON public.terminal_small_payment_cases
FOR UPDATE
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR manager_user_id = auth.uid()
)
WITH CHECK (
  public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR manager_user_id = auth.uid()
);

DROP POLICY IF EXISTS "small_payment_events_read" ON public.terminal_small_payment_case_events;
CREATE POLICY "small_payment_events_read"
ON public.terminal_small_payment_case_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.terminal_small_payment_cases c
    WHERE c.id = case_id
      AND (
        c.payer_user_id = auth.uid()
        OR c.manager_user_id = auth.uid()
        OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_view')
        OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
        OR public.has_terminal_permission(auth.uid(), 'terminal_payer_view')
      )
  )
);

DROP POLICY IF EXISTS "small_payment_events_create" ON public.terminal_small_payment_case_events;
CREATE POLICY "small_payment_events_create"
ON public.terminal_small_payment_case_events
FOR INSERT
TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.terminal_small_payment_cases c
    WHERE c.id = case_id
      AND (
        c.manager_user_id = auth.uid()
        OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
        OR public.has_terminal_permission(auth.uid(), 'terminal_payer_view')
      )
  )
);

CREATE OR REPLACE FUNCTION public.assign_small_payment_manager(
  p_adv_no text DEFAULT NULL,
  p_total_price numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_user_id uuid;
BEGIN
  SELECT a.manager_user_id
  INTO v_manager_user_id
  FROM public.terminal_small_payment_manager_assignments a
  LEFT JOIN public.terminal_order_size_ranges r ON r.id = a.size_range_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS open_count
    FROM public.terminal_small_payment_cases c
    WHERE c.manager_user_id = a.manager_user_id
      AND c.status NOT IN ('resolved', 'closed', 'cancelled')
  ) workload ON true
  WHERE a.is_active = true
    AND (
      (a.assignment_type = 'ad_id' AND p_adv_no IS NOT NULL AND a.ad_id = p_adv_no)
      OR
      (a.assignment_type = 'size_range' AND p_total_price IS NOT NULL AND r.is_active = true AND p_total_price >= r.min_amount AND p_total_price <= r.max_amount)
    )
  ORDER BY
    CASE WHEN a.assignment_type = 'ad_id' THEN 0 ELSE 1 END,
    COALESCE(workload.open_count, 0),
    a.created_at
  LIMIT 1;

  RETURN v_manager_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_terminal_small_payment_case(
  p_order_number text,
  p_case_type text DEFAULT 'post_payment_followup',
  p_status text DEFAULT 'open',
  p_payer_user_id uuid DEFAULT NULL,
  p_marked_paid_at timestamptz DEFAULT NULL,
  p_created_from text DEFAULT 'manual',
  p_adv_no text DEFAULT NULL,
  p_total_price numeric DEFAULT NULL,
  p_asset text DEFAULT NULL,
  p_fiat_unit text DEFAULT 'INR',
  p_counterparty_nickname text DEFAULT NULL,
  p_binance_status text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_manager uuid;
  v_old_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_terminal_permission(v_actor, 'terminal_payer_view')
    OR public.has_terminal_permission(v_actor, 'terminal_small_payments_view')
    OR public.has_terminal_permission(v_actor, 'terminal_small_payments_manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized for small payment case creation';
  END IF;

  SELECT public.assign_small_payment_manager(p_adv_no, p_total_price) INTO v_manager;

  SELECT id, status
  INTO v_case_id, v_old_status
  FROM public.terminal_small_payment_cases
  WHERE order_number = p_order_number
    AND status NOT IN ('resolved', 'closed', 'cancelled')
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_case_id IS NULL THEN
    INSERT INTO public.terminal_small_payment_cases (
      order_number,
      case_type,
      status,
      payer_user_id,
      manager_user_id,
      marked_paid_at,
      opened_at,
      tags,
      created_from,
      adv_no,
      total_price,
      asset,
      fiat_unit,
      counterparty_nickname,
      binance_status,
      notes,
      created_by,
      updated_by
    ) VALUES (
      p_order_number,
      p_case_type,
      p_status,
      COALESCE(p_payer_user_id, v_actor),
      v_manager,
      p_marked_paid_at,
      COALESCE(p_marked_paid_at, now()),
      ARRAY[p_case_type],
      p_created_from,
      p_adv_no,
      p_total_price,
      p_asset,
      COALESCE(p_fiat_unit, 'INR'),
      p_counterparty_nickname,
      p_binance_status,
      p_note,
      v_actor,
      v_actor
    )
    RETURNING id INTO v_case_id;

    INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, new_value, note)
    VALUES (
      v_case_id,
      p_order_number,
      'created',
      v_actor,
      jsonb_build_object('case_type', p_case_type, 'status', p_status, 'manager_user_id', v_manager),
      p_note
    );

    IF v_manager IS NOT NULL THEN
      INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, new_value)
      VALUES (v_case_id, p_order_number, 'assigned', v_actor, jsonb_build_object('manager_user_id', v_manager));
    END IF;
  ELSE
    UPDATE public.terminal_small_payment_cases
    SET
      case_type = CASE WHEN p_case_type = 'post_payment_followup' AND case_type <> 'post_payment_followup' THEN case_type ELSE p_case_type END,
      status = CASE WHEN status IN ('resolved', 'closed', 'cancelled') THEN status ELSE p_status END,
      payer_user_id = COALESCE(payer_user_id, p_payer_user_id, v_actor),
      manager_user_id = COALESCE(manager_user_id, v_manager),
      marked_paid_at = COALESCE(marked_paid_at, p_marked_paid_at),
      tags = CASE WHEN p_case_type = ANY(tags) THEN tags ELSE array_append(tags, p_case_type) END,
      adv_no = COALESCE(adv_no, p_adv_no),
      total_price = COALESCE(total_price, p_total_price),
      asset = COALESCE(asset, p_asset),
      fiat_unit = COALESCE(fiat_unit, p_fiat_unit, 'INR'),
      counterparty_nickname = COALESCE(counterparty_nickname, p_counterparty_nickname),
      binance_status = COALESCE(p_binance_status, binance_status),
      notes = COALESCE(p_note, notes),
      updated_by = v_actor
    WHERE id = v_case_id;

    IF v_old_status IS DISTINCT FROM p_status THEN
      INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, previous_value, new_value, note)
      VALUES (
        v_case_id,
        p_order_number,
        'status_changed',
        v_actor,
        jsonb_build_object('status', v_old_status),
        jsonb_build_object('status', p_status),
        p_note
      );
    END IF;
  END IF;

  RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_terminal_small_payment_case_event(
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
  FROM public.terminal_small_payment_cases
  WHERE id = p_case_id
    AND (
      manager_user_id = v_actor
      OR public.has_terminal_permission(v_actor, 'terminal_small_payments_manage')
    );

  IF v_order_number IS NULL THEN
    RAISE EXCEPTION 'Not authorized for small payment case event';
  END IF;

  INSERT INTO public.terminal_small_payment_case_events (
    case_id,
    order_number,
    event_type,
    actor_user_id,
    previous_value,
    new_value,
    note
  ) VALUES (
    p_case_id,
    v_order_number,
    p_event_type,
    v_actor,
    p_previous_value,
    p_new_value,
    p_note
  )
  RETURNING id INTO v_event_id;

  IF p_event_type = 'contacted' THEN
    UPDATE public.terminal_small_payment_cases
    SET last_contacted_at = now(), updated_by = v_actor
    WHERE id = p_case_id;
  ELSIF p_event_type = 'checked' THEN
    UPDATE public.terminal_small_payment_cases
    SET last_checked_at = now(), updated_by = v_actor
    WHERE id = p_case_id;
  ELSIF p_event_type IN ('resolved', 'closed') THEN
    UPDATE public.terminal_small_payment_cases
    SET
      status = CASE WHEN p_event_type = 'resolved' THEN 'resolved' ELSE 'closed' END,
      resolved_at = CASE WHEN p_event_type = 'resolved' THEN now() ELSE resolved_at END,
      closed_at = CASE WHEN p_event_type = 'closed' THEN now() ELSE closed_at END,
      updated_by = v_actor
    WHERE id = p_case_id;
  END IF;

  RETURN v_event_id;
END;
$$;