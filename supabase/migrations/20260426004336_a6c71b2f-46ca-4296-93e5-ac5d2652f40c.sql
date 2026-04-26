-- Ensure enum permissions exist
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_small_payments_view';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_small_payments_manage';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_small_payments_assign';

-- Seed permissions to existing terminal roles based on role names/hierarchy.
-- Admin/supervisor style roles get full supervision + assignment.
INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.permission::public.terminal_permission
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES
  ('terminal_small_payments_view'),
  ('terminal_small_payments_manage'),
  ('terminal_small_payments_assign')
) AS p(permission)
WHERE (
  lower(r.name) IN ('admin', 'super admin', 'terminal admin', 'supervisor', 'manager', 'operations manager', 'operation manager')
  OR COALESCE(r.hierarchy_level, 999) <= 1
)
ON CONFLICT DO NOTHING;

-- Payer-style roles get only case creation/read for their own originated handoffs.
INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.permission::public.terminal_permission
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES
  ('terminal_small_payments_view')
) AS p(permission)
WHERE lower(r.name) IN ('payer', 'pay assignment', 'payment assignment', 'small payments manager')
ON CONFLICT DO NOTHING;

-- Small Payments Manager role gets queue management, but not assignment configuration.
INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.permission::public.terminal_permission
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES
  ('terminal_small_payments_view'),
  ('terminal_small_payments_manage')
) AS p(permission)
WHERE lower(r.name) IN ('small payments manager', 'small payment manager')
ON CONFLICT DO NOTHING;

-- Resolve existing duplicate active manager assignments before adding exclusive indexes.
WITH ranked_range AS (
  SELECT id,
         row_number() OVER (PARTITION BY size_range_id ORDER BY created_at, id) AS rn
  FROM public.terminal_small_payment_manager_assignments
  WHERE is_active = true AND assignment_type = 'size_range' AND size_range_id IS NOT NULL
)
UPDATE public.terminal_small_payment_manager_assignments a
SET is_active = false
FROM ranked_range r
WHERE a.id = r.id AND r.rn > 1;

WITH ranked_ad AS (
  SELECT id,
         row_number() OVER (PARTITION BY ad_id ORDER BY created_at, id) AS rn
  FROM public.terminal_small_payment_manager_assignments
  WHERE is_active = true AND assignment_type = 'ad_id' AND ad_id IS NOT NULL
)
UPDATE public.terminal_small_payment_manager_assignments a
SET is_active = false
FROM ranked_ad r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tspma_unique_active_range_global
  ON public.terminal_small_payment_manager_assignments (size_range_id)
  WHERE is_active = true AND assignment_type = 'size_range' AND size_range_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tspma_unique_active_ad_global
  ON public.terminal_small_payment_manager_assignments (ad_id)
  WHERE is_active = true AND assignment_type = 'ad_id' AND ad_id IS NOT NULL;

-- Tighten case/event read access: payers only their own, managers their own, supervisors all.
DROP POLICY IF EXISTS "small_payment_cases_read" ON public.terminal_small_payment_cases;
CREATE POLICY "small_payment_cases_read"
ON public.terminal_small_payment_cases
FOR SELECT
TO authenticated
USING (
  payer_user_id = auth.uid()
  OR manager_user_id = auth.uid()
  OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
);

DROP POLICY IF EXISTS "small_payment_events_read" ON public.terminal_small_payment_case_events;
CREATE POLICY "small_payment_events_read"
ON public.terminal_small_payment_case_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.terminal_small_payment_cases c
    WHERE c.id = terminal_small_payment_case_events.case_id
      AND (
        c.payer_user_id = auth.uid()
        OR c.manager_user_id = auth.uid()
        OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
      )
  )
);

-- Keep event creation restricted to assigned managers/supervisors via RPC/direct policy.
DROP POLICY IF EXISTS "small_payment_events_create" ON public.terminal_small_payment_case_events;
CREATE POLICY "small_payment_events_create"
ON public.terminal_small_payment_case_events
FOR INSERT
TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.terminal_small_payment_cases c
    WHERE c.id = terminal_small_payment_case_events.case_id
      AND (
        c.manager_user_id = auth.uid()
        OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
      )
  )
);

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
    OR public.has_terminal_permission(v_actor, 'terminal_payer_manage')
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

CREATE OR REPLACE FUNCTION public.update_terminal_small_payment_case_status(
  p_case_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old_status text;
  v_order_number text;
  v_event_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('open', 'waiting_counterparty', 'awaiting_refund', 'ready_to_repay', 'resolved', 'closed', 'cancelled', 'appeal') THEN
    RAISE EXCEPTION 'Invalid small payment status: %', p_status;
  END IF;

  SELECT status, order_number
  INTO v_old_status, v_order_number
  FROM public.terminal_small_payment_cases
  WHERE id = p_case_id
    AND (
      manager_user_id = v_actor
      OR public.has_terminal_permission(v_actor, 'terminal_small_payments_manage')
    );

  IF v_order_number IS NULL THEN
    RAISE EXCEPTION 'Not authorized for small payment status update';
  END IF;

  UPDATE public.terminal_small_payment_cases
  SET
    status = p_status,
    resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE resolved_at END,
    closed_at = CASE WHEN p_status = 'closed' THEN now() ELSE closed_at END,
    tags = CASE WHEN p_status = ANY(tags) THEN tags ELSE array_append(tags, p_status) END,
    updated_by = v_actor
  WHERE id = p_case_id;

  IF v_old_status IS DISTINCT FROM p_status THEN
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
      'status_changed',
      v_actor,
      jsonb_build_object('status', v_old_status),
      jsonb_build_object('status', p_status),
      p_note
    )
    RETURNING id INTO v_event_id;
  END IF;

  RETURN p_case_id;
END;
$$;