CREATE OR REPLACE FUNCTION public.is_terminal_final_order_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status IS NULL THEN false
    WHEN btrim(p_status) IN ('5', '6', '7') THEN true
    ELSE upper(p_status) LIKE '%COMPLETED%'
      OR upper(p_status) LIKE '%CANCEL%'
      OR upper(p_status) LIKE '%EXPIRED%'
      OR upper(p_status) LIKE '%TIMEOUT%'
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_terminal_order_final(p_order_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
      AND public.is_terminal_final_order_status(h.order_status)
  ) OR EXISTS (
    SELECT 1
    FROM public.p2p_order_records p
    WHERE p.binance_order_number = p_order_number
      AND public.is_terminal_final_order_status(p.order_status)
  );
$$;

CREATE OR REPLACE FUNCTION public.assign_small_payment_manager(p_adv_no text DEFAULT NULL::text, p_total_price numeric DEFAULT NULL::numeric)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND NOT public.is_terminal_order_final(c.order_number)
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
$function$;

CREATE OR REPLACE FUNCTION public.upsert_terminal_small_payment_case(p_order_number text, p_case_type text DEFAULT 'post_payment_followup'::text, p_status text DEFAULT 'open'::text, p_payer_user_id uuid DEFAULT NULL::uuid, p_marked_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_from text DEFAULT 'manual'::text, p_adv_no text DEFAULT NULL::text, p_total_price numeric DEFAULT NULL::numeric, p_asset text DEFAULT NULL::text, p_fiat_unit text DEFAULT 'INR'::text, p_counterparty_nickname text DEFAULT NULL::text, p_binance_status text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_manager uuid;
  v_old_manager uuid;
  v_old_status text;
  v_is_final boolean;
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

  v_is_final := public.is_terminal_order_final(p_order_number) OR public.is_terminal_final_order_status(p_binance_status);

  SELECT id, status, manager_user_id
  INTO v_case_id, v_old_status, v_old_manager
  FROM public.terminal_small_payment_cases
  WHERE order_number = p_order_number
    AND status NOT IN ('resolved', 'closed', 'cancelled')
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_is_final THEN
    IF v_case_id IS NOT NULL THEN
      UPDATE public.terminal_small_payment_cases
      SET status = 'resolved',
          binance_status = COALESCE(p_binance_status, binance_status),
          notes = COALESCE(p_note, notes),
          updated_by = v_actor,
          updated_at = now()
      WHERE id = v_case_id;

      IF v_old_status IS DISTINCT FROM 'resolved' THEN
        INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, previous_value, new_value, note)
        VALUES (v_case_id, p_order_number, 'resolved', v_actor, jsonb_build_object('status', v_old_status), jsonb_build_object('status', 'resolved'), 'Auto-resolved because Binance/P2P order is finalized.');
      END IF;

      RETURN v_case_id;
    END IF;

    RAISE EXCEPTION 'Cannot create Small Payments case for finalized Binance order %', p_order_number;
  END IF;

  SELECT public.assign_small_payment_manager(p_adv_no, p_total_price) INTO v_manager;

  IF v_case_id IS NULL THEN
    INSERT INTO public.terminal_small_payment_cases (
      order_number, case_type, status, payer_user_id, manager_user_id, marked_paid_at, opened_at, tags, created_from, adv_no, total_price, asset, fiat_unit, counterparty_nickname, binance_status, notes, created_by, updated_by
    ) VALUES (
      p_order_number, p_case_type, p_status, COALESCE(p_payer_user_id, v_actor), v_manager, p_marked_paid_at, COALESCE(p_marked_paid_at, now()), ARRAY[p_case_type], p_created_from, p_adv_no, p_total_price, p_asset, COALESCE(p_fiat_unit, 'INR'), p_counterparty_nickname, p_binance_status, p_note, v_actor, v_actor
    )
    RETURNING id INTO v_case_id;

    INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, new_value, note)
    VALUES (v_case_id, p_order_number, 'created', v_actor, jsonb_build_object('case_type', p_case_type, 'status', p_status, 'manager_user_id', v_manager), p_note);

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
      manager_user_id = COALESCE(v_manager, manager_user_id),
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

    IF v_manager IS NOT NULL AND v_old_manager IS DISTINCT FROM v_manager THEN
      INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, previous_value, new_value)
      VALUES (v_case_id, p_order_number, 'assigned', v_actor, jsonb_build_object('manager_user_id', v_old_manager), jsonb_build_object('manager_user_id', v_manager));
    END IF;

    IF v_old_status IS DISTINCT FROM p_status THEN
      INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, actor_user_id, previous_value, new_value, note)
      VALUES (v_case_id, p_order_number, 'status_changed', v_actor, jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_status), p_note);
    END IF;
  END IF;

  RETURN v_case_id;
END;
$function$;

WITH finalized AS (
  SELECT c.id, c.order_number, c.status
  FROM public.terminal_small_payment_cases c
  WHERE c.status NOT IN ('resolved', 'closed', 'cancelled')
    AND public.is_terminal_order_final(c.order_number)
), updated AS (
  UPDATE public.terminal_small_payment_cases c
  SET status = 'resolved',
      notes = COALESCE(c.notes, 'Auto-resolved because Binance/P2P order is finalized.'),
      updated_at = now()
  FROM finalized f
  WHERE c.id = f.id
  RETURNING c.id, c.order_number, f.status AS previous_status
)
INSERT INTO public.terminal_small_payment_case_events (case_id, order_number, event_type, previous_value, new_value, note)
SELECT u.id, u.order_number, 'resolved', jsonb_build_object('status', u.previous_status), jsonb_build_object('status', 'resolved'), 'Auto-resolved because Binance/P2P order is finalized.'
FROM updated u
WHERE NOT EXISTS (
  SELECT 1 FROM public.terminal_small_payment_case_events e
  WHERE e.case_id = u.id
    AND e.event_type = 'resolved'
    AND e.note = 'Auto-resolved because Binance/P2P order is finalized.'
);