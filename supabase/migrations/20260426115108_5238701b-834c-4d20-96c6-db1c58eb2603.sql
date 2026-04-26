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
  v_old_manager uuid;
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

  SELECT id, status, manager_user_id
  INTO v_case_id, v_old_status, v_old_manager
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
      VALUES (
        v_case_id,
        p_order_number,
        'assigned',
        v_actor,
        jsonb_build_object('manager_user_id', v_old_manager),
        jsonb_build_object('manager_user_id', v_manager)
      );
    END IF;

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