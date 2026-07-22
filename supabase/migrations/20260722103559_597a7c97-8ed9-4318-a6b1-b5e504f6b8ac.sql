CREATE OR REPLACE FUNCTION public.create_buyer_client_with_evidence(
  p_name text,
  p_client_id text,
  p_phone text DEFAULT NULL::text,
  p_order_amount numeric DEFAULT 0,
  p_order_date date DEFAULT CURRENT_DATE,
  p_sales_order_id uuid DEFAULT NULL::uuid,
  p_nickname text DEFAULT NULL::text,
  p_cp_userno text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, client_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_existing_client_id text;
  v_base_name text := btrim(p_name);
  v_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  v_nick text := NULLIF(btrim(COALESCE(p_nickname,'')),'');
  v_cp_userno text := NULLIF(btrim(COALESCE(p_cp_userno,'')),'');
  v_try_name text;
  v_attempt int := 0;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;

  -- Idempotency by Binance userNo: this is the only safe cross-account anchor.
  IF v_cp_userno IS NOT NULL THEN
    SELECT c.id, c.client_id
      INTO v_existing_id, v_existing_client_id
    FROM public.client_binance_usernos bu
    JOIN public.clients c ON c.id = bu.client_id
    WHERE bu.cp_userno = v_cp_userno
      AND bu.is_active = true
      AND c.is_deleted = false
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF v_phone IS NOT NULL THEN
        UPDATE public.clients
           SET phone = COALESCE(NULLIF(phone, ''), v_phone),
               updated_at = now()
         WHERE public.clients.id = v_existing_id;
      END IF;
      RETURN QUERY SELECT v_existing_id, v_existing_client_id;
      RETURN;
    END IF;
  END IF;

  -- Idempotency for repeated terminal clicks before/without userNo persistence:
  -- reuse a still-pending buyer stub with the same phone, or same exact name when
  -- no phone is available. Approved clients are deliberately excluded here.
  IF v_phone IS NOT NULL THEN
    SELECT c.id, c.client_id
      INTO v_existing_id, v_existing_client_id
    FROM public.clients c
    WHERE c.is_deleted = false
      AND c.is_buyer = true
      AND COALESCE(c.buyer_approval_status, 'PENDING') = 'PENDING'
      AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') = v_phone
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    SELECT c.id, c.client_id
      INTO v_existing_id, v_existing_client_id
    FROM public.clients c
    WHERE c.is_deleted = false
      AND c.is_buyer = true
      AND COALESCE(c.buyer_approval_status, 'PENDING') = 'PENDING'
      AND lower(btrim(c.name)) = lower(v_base_name)
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_orders so
        WHERE so.client_id = c.id
          AND so.status = 'COMPLETED'
      )
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    IF v_phone IS NOT NULL THEN
      UPDATE public.clients
         SET phone = COALESCE(NULLIF(phone, ''), v_phone),
             updated_at = now()
       WHERE public.clients.id = v_existing_id;
    END IF;

    IF v_cp_userno IS NOT NULL THEN
      INSERT INTO public.client_binance_usernos (client_id, cp_userno, source, first_seen_at, last_seen_at, is_active)
      VALUES (v_existing_id, v_cp_userno, 'approval', now(), now(), true)
      ON CONFLICT (cp_userno) DO UPDATE
        SET last_seen_at = now(), is_active = true;
    END IF;

    IF v_nick IS NOT NULL THEN
      INSERT INTO public.client_binance_nicknames (client_id, nickname, source, is_active)
      VALUES (v_existing_id, v_nick, 'approval', true)
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.client_onboarding_approvals (
      client_name, client_phone, order_amount, order_date,
      approval_status, sales_order_id, resolved_client_id, cp_userno, binance_nickname
    )
    SELECT c.name, v_phone, COALESCE(p_order_amount, 0), COALESCE(p_order_date, CURRENT_DATE),
           'PENDING', p_sales_order_id, v_existing_id, v_cp_userno, v_nick
    FROM public.clients c
    WHERE c.id = v_existing_id
      AND NOT EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals a
        WHERE a.approval_status = 'PENDING'
          AND (
            (p_sales_order_id IS NOT NULL AND a.sales_order_id = p_sales_order_id)
            OR (v_cp_userno IS NOT NULL AND a.cp_userno = v_cp_userno)
            OR (a.resolved_client_id = v_existing_id AND a.sales_order_id IS NULL)
          )
      );

    RETURN QUERY SELECT v_existing_id, v_existing_client_id;
    RETURN;
  END IF;

  -- Insert the client first (with auto-disambiguation on name collision) so we can
  -- attach the onboarding-approval evidence row using the FINAL name.
  v_try_name := v_base_name;
  LOOP
    BEGIN
      INSERT INTO public.clients (
        name, client_id, client_type, kyc_status, date_of_onboarding,
        phone, state, risk_appetite, is_buyer, is_seller,
        buyer_approval_status, seller_approval_status
      ) VALUES (
        v_try_name, p_client_id, 'BUYER', 'PENDING', CURRENT_DATE,
        v_phone, NULL, 'STANDARD', true, false,
        'PENDING', 'NOT_APPLICABLE'
      )
      RETURNING public.clients.id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt > 25 THEN RAISE; END IF;
      IF v_nick IS NOT NULL THEN
        v_try_name := v_base_name || ' • ' || v_nick ||
          CASE WHEN v_attempt > 1 THEN ' (' || v_attempt || ')' ELSE '' END;
      ELSE
        v_try_name := v_base_name || ' • ' || right(p_client_id, 6) ||
          CASE WHEN v_attempt > 1 THEN ' (' || v_attempt || ')' ELSE '' END;
      END IF;
    END;
  END LOOP;

  IF v_cp_userno IS NOT NULL THEN
    INSERT INTO public.client_binance_usernos (client_id, cp_userno, source, first_seen_at, last_seen_at, is_active)
    VALUES (v_id, v_cp_userno, 'approval', now(), now(), true)
    ON CONFLICT (cp_userno) DO UPDATE
      SET last_seen_at = now(), is_active = true;
  END IF;

  -- Evidence row keyed to the FINAL client name, linked directly to the new client.
  INSERT INTO public.client_onboarding_approvals (
    client_name, client_phone, order_amount, order_date,
    approval_status, sales_order_id, resolved_client_id, cp_userno, binance_nickname
  ) VALUES (
    v_try_name, v_phone, COALESCE(p_order_amount, 0), COALESCE(p_order_date, CURRENT_DATE),
    'PENDING', p_sales_order_id, v_id, v_cp_userno, v_nick
  );

  IF v_nick IS NOT NULL THEN
    INSERT INTO public.client_binance_nicknames (client_id, nickname, source, is_active)
    VALUES (v_id, v_nick, 'approval', true)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_id, p_client_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_buyer_client_with_evidence(
  text, text, text, numeric, date, uuid, text
);

CREATE OR REPLACE FUNCTION public.link_client_userno(p_client_id uuid, p_cp_userno text, p_source text DEFAULT 'order_detail'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_existing_client_id uuid;
BEGIN
  IF p_cp_userno IS NULL OR btrim(p_cp_userno) = '' THEN
    RETURN;
  END IF;

  SELECT client_id INTO v_existing_client_id
  FROM public.client_binance_usernos
  WHERE cp_userno = btrim(p_cp_userno)
    AND is_active = true
  LIMIT 1;

  -- Never silently reassign a Binance userNo from one client to another.
  IF v_existing_client_id IS NOT NULL AND v_existing_client_id <> p_client_id THEN
    RAISE EXCEPTION 'Binance User No % is already linked to another client', btrim(p_cp_userno)
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.client_binance_usernos (client_id, cp_userno, source, first_seen_at, last_seen_at, is_active)
  VALUES (p_client_id, btrim(p_cp_userno), COALESCE(p_source, 'order_detail'), now(), now(), true)
  ON CONFLICT (cp_userno) DO UPDATE
    SET client_id = EXCLUDED.client_id,
        last_seen_at = now(),
        is_active = true;
END;
$function$;