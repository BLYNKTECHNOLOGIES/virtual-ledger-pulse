CREATE OR REPLACE FUNCTION public.propagate_counterparty_contact(
  p_order_number text, p_phone text, p_state text, p_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone,'')), '');
  v_state text := nullif(btrim(coalesce(p_state,'')), '');
  v_userno text; v_nick text;
  v_sync int := 0; v_so int := 0; v_so_skipped int := 0;
BEGIN
  IF v_uid IS NULL OR NOT (
       has_terminal_permission(v_uid, 'terminal_orders_view')
    OR has_terminal_permission(v_uid, 'terminal_appeals_view')
    OR can_access_client_kyc(v_uid)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_order_number IS NULL OR btrim(p_order_number) = '' THEN
    RAISE EXCEPTION 'Order number required';
  END IF;
  IF v_phone IS NULL AND v_state IS NULL THEN
    RETURN jsonb_build_object('sync_rows', 0, 'sales_orders_filled', 0, 'sales_orders_kept', 0);
  END IF;

  -- Identity of this order's counterparty: userNo first, else exact unmasked nickname.
  SELECT nullif(c.cp_userno,''), nullif(c.nickname,'') INTO v_userno, v_nick
    FROM cp_order_identity c WHERE c.order_number = p_order_number LIMIT 1;
  IF v_userno IS NULL OR v_nick IS NULL THEN
    SELECT coalesce(v_userno, nullif(t.order_data->>'cp_userno','')),
           coalesce(v_nick, nullif(t.order_data->>'counterparty_nickname_unmasked',''))
      INTO v_userno, v_nick
      FROM terminal_sales_sync t WHERE t.binance_order_number = p_order_number LIMIT 1;
  END IF;
  IF v_nick LIKE '%*%' THEN v_nick := NULL; END IF;  -- never a masked nickname

  CREATE TEMP TABLE IF NOT EXISTS _cp_targets (id uuid, sales_order_id uuid) ON COMMIT DROP;
  TRUNCATE _cp_targets;
  INSERT INTO _cp_targets
  SELECT t.id, t.sales_order_id
    FROM terminal_sales_sync t
    LEFT JOIN cp_order_identity c ON c.order_number = t.binance_order_number
   WHERE t.binance_order_number = p_order_number
      OR (v_userno IS NOT NULL
          AND coalesce(nullif(c.cp_userno,''), nullif(t.order_data->>'cp_userno','')) = v_userno)
      OR (v_userno IS NULL AND v_nick IS NOT NULL
          AND coalesce(nullif(c.cp_userno,''), nullif(t.order_data->>'cp_userno','')) IS NULL
          AND coalesce(nullif(t.order_data->>'counterparty_nickname_unmasked',''), nullif(c.nickname,'')) = v_nick);

  SELECT count(*) INTO v_sync FROM _cp_targets;
  SELECT count(*) FILTER (WHERE (v_phone IS NOT NULL AND coalesce(btrim(s.client_phone),'') = '')
                             OR (v_state IS NOT NULL AND coalesce(btrim(s.client_state),'') = '')),
         count(*) FILTER (WHERE NOT ((v_phone IS NOT NULL AND coalesce(btrim(s.client_phone),'') = '')
                             OR (v_state IS NOT NULL AND coalesce(btrim(s.client_state),'') = '')))
    INTO v_so, v_so_skipped
    FROM sales_orders s
   WHERE s.id IN (SELECT sales_order_id FROM _cp_targets WHERE sales_order_id IS NOT NULL)
      OR s.order_number = p_order_number;

  IF NOT p_dry_run THEN
    UPDATE terminal_sales_sync t
       SET contact_number = coalesce(v_phone, t.contact_number),
           state = coalesce(v_state, t.state)
     WHERE t.id IN (SELECT id FROM _cp_targets);

    -- Approved sales orders keep what was recorded at approval; only empty fields are filled.
    UPDATE sales_orders s
       SET client_phone = CASE WHEN v_phone IS NOT NULL AND coalesce(btrim(s.client_phone),'') = '' THEN v_phone ELSE s.client_phone END,
           client_state = CASE WHEN v_state IS NOT NULL AND coalesce(btrim(s.client_state),'') = '' THEN v_state ELSE s.client_state END
     WHERE (s.id IN (SELECT sales_order_id FROM _cp_targets WHERE sales_order_id IS NOT NULL)
            OR s.order_number = p_order_number)
       AND ((v_phone IS NOT NULL AND coalesce(btrim(s.client_phone),'') = '')
         OR (v_state IS NOT NULL AND coalesce(btrim(s.client_state),'') = ''));
  END IF;

  RETURN jsonb_build_object('matched_by', CASE WHEN v_userno IS NOT NULL THEN 'userno'
                                               WHEN v_nick IS NOT NULL THEN 'nickname' ELSE 'order_only' END,
                            'sync_rows', v_sync, 'sales_orders_filled', v_so,
                            'sales_orders_kept', v_so_skipped, 'dry_run', p_dry_run);
END $$;
REVOKE ALL ON FUNCTION public.propagate_counterparty_contact(text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propagate_counterparty_contact(text,text,text,boolean) TO authenticated, service_role;