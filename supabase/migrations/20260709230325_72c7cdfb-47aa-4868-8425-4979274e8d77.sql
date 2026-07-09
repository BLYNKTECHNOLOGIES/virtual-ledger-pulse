-- userNo/nickname-aware client creation guard.
-- When a genuinely distinct Binance account shares a name with an existing client,
-- auto-create a SEPARATE client with a disambiguated name instead of colliding on
-- idx_clients_unique_name_active. Identity anchor is the Binance nickname (proxy for userNo).

CREATE OR REPLACE FUNCTION public.create_seller_client_with_evidence(
  p_name text,
  p_client_id text,
  p_phone text DEFAULT NULL::text,
  p_nickname text DEFAULT NULL::text,
  p_verified_name text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, client_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id uuid;
  v_base_name text := btrim(p_name);
  v_nick text := NULLIF(btrim(COALESCE(p_nickname,'')),'');
  v_try_name text;
  v_attempt int := 0;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;

  v_try_name := v_base_name;
  LOOP
    BEGIN
      INSERT INTO public.clients (
        name, client_id, client_type, kyc_status, date_of_onboarding,
        phone, risk_appetite, is_buyer, is_seller,
        buyer_approval_status, seller_approval_status
      ) VALUES (
        v_try_name, p_client_id, 'SELLER', 'PENDING', CURRENT_DATE,
        p_phone, 'STANDARD', false, true,
        'NOT_APPLICABLE', 'PENDING'
      )
      RETURNING public.clients.id INTO v_new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Only auto-disambiguate on the active-name uniqueness collision.
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

  IF v_nick IS NOT NULL THEN
    INSERT INTO public.client_binance_nicknames (client_id, nickname, source, is_active)
    VALUES (v_new_id, v_nick, 'approval', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_verified_name IS NOT NULL AND length(btrim(p_verified_name)) > 0 THEN
    INSERT INTO public.client_verified_names (client_id, verified_name, source)
    VALUES (v_new_id, btrim(p_verified_name), 'approval')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT c.id, c.client_id FROM public.clients c WHERE c.id = v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_buyer_client_with_evidence(
  p_name text,
  p_client_id text,
  p_phone text DEFAULT NULL::text,
  p_order_amount numeric DEFAULT 0,
  p_order_date date DEFAULT CURRENT_DATE,
  p_sales_order_id uuid DEFAULT NULL::uuid,
  p_nickname text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, client_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_base_name text := btrim(p_name);
  v_nick text := NULLIF(btrim(COALESCE(p_nickname,'')),'');
  v_try_name text;
  v_attempt int := 0;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;

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
        NULLIF(TRIM(COALESCE(p_phone,'')),''), NULL, 'STANDARD', true, false,
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

  -- Evidence row keyed to the FINAL client name, linked directly to the new client
  -- so the deferred ghost-pending trigger is satisfied.
  INSERT INTO public.client_onboarding_approvals (
    client_name, client_phone, order_amount, order_date,
    approval_status, sales_order_id, resolved_client_id
  ) VALUES (
    v_try_name, p_phone, COALESCE(p_order_amount, 0), COALESCE(p_order_date, CURRENT_DATE),
    'PENDING', p_sales_order_id, v_id
  );

  IF v_nick IS NOT NULL THEN
    INSERT INTO public.client_binance_nicknames (client_id, nickname, source, is_active)
    VALUES (v_id, v_nick, 'approval', true)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_id, p_client_id;
END;
$function$;