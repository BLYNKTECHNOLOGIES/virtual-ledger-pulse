DROP FUNCTION IF EXISTS public.phase3a_demerge();

CREATE FUNCTION public.phase3a_demerge()
RETURNS TABLE(out_batch_id uuid, clients_created int, skipped_same_identity int, skipped_name_collision int, sales_moved int, purchases_moved int, nicknames_moved int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_clients int := 0;
  v_skipped int := 0;
  v_collision int := 0;
  v_sales int := 0;
  v_purch int := 0;
  v_nicks int := 0;
  v_rc int;
  r record;
  n record;
  v_name text;
  v_target_id uuid;
  v_existing_id uuid;
  v_code text;
  v_is_buyer boolean;
  v_is_seller boolean;
  v_onboard date;
  v_parent clients%ROWTYPE;
BEGIN
  FOR r IN
    SELECT DISTINCT m.client_uuid, m.resolved_userno
    FROM client_nickname_merge_audit_report m
    WHERE m.proposed_action='SPLIT' AND m.resolved_userno IS NOT NULL
      AND m.resolved_userno <> m.anchor_userno
      AND NOT (m.nickname ILIKE 'BlynkEx%' OR m.nickname ILIKE 'ASEC%')
  LOOP
    SELECT verified_name INTO v_name
    FROM cp_order_identity c
    WHERE c.cp_userno = r.resolved_userno AND coalesce(btrim(c.verified_name),'') <> ''
    ORDER BY c.create_time DESC LIMIT 1;
    IF v_name IS NULL THEN CONTINUE; END IF;
    v_name := btrim(v_name);

    SELECT * INTO v_parent FROM clients WHERE id = r.client_uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF upper(v_name) = upper(btrim(v_parent.name)) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_existing_id FROM clients
    WHERE upper(btrim(name)) = upper(v_name) AND is_deleted = false LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      v_collision := v_collision + 1;
      INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, new_value)
      VALUES (v_batch, 'skipped_name_collision', r.resolved_userno, r.client_uuid, v_existing_id, v_name);
      CONTINUE;
    END IF;

    v_is_seller := EXISTS (SELECT 1 FROM purchase_orders p
      WHERE p.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno=r.resolved_userno));
    v_is_buyer := EXISTS (SELECT 1 FROM sales_orders s
      WHERE s.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno=r.resolved_userno));

    SELECT COALESCE(to_timestamp(MIN(create_time)/1000)::date, CURRENT_DATE) INTO v_onboard
    FROM cp_order_identity c WHERE c.cp_userno=r.resolved_userno;
    LOOP
      v_code := upper(substr(md5(random()::text||clock_timestamp()::text),1,6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM clients WHERE client_id=v_code);
    END LOOP;
    INSERT INTO clients (client_id, name, date_of_onboarding, client_type, risk_appetite,
                         kyc_status, is_buyer, is_seller, buyer_approval_status, seller_approval_status)
    VALUES (v_code, v_name, v_onboard, v_parent.client_type, v_parent.risk_appetite,
            'PENDING', COALESCE(v_is_buyer,false), COALESCE(v_is_seller,false),
            CASE WHEN v_is_buyer THEN 'APPROVED' ELSE NULL END,
            CASE WHEN v_is_seller THEN 'APPROVED' ELSE NULL END)
    RETURNING id INTO v_target_id;
    v_clients := v_clients + 1;
    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, new_value)
    VALUES (v_batch, 'client_created', v_target_id::text, r.client_uuid, v_target_id, v_name);
    INSERT INTO client_verified_names(client_id, verified_name, source, first_seen_at, last_seen_at, created_at)
    VALUES (v_target_id, v_name, 'phase3a_demerge', now(), now(), now()) ON CONFLICT DO NOTHING;

    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, old_value, new_value)
    SELECT v_batch, 'sales_order', s.order_number, s.client_id, v_target_id, s.client_name, v_name
    FROM sales_orders s
    WHERE s.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);
    UPDATE sales_orders s SET client_id = v_target_id, client_name = v_name
    WHERE s.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);
    GET DIAGNOSTICS v_rc = ROW_COUNT; v_sales := v_sales + v_rc;

    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, old_value, new_value)
    SELECT v_batch, 'purchase_order', p.order_number, NULL, v_target_id, p.supplier_name, v_name
    FROM purchase_orders p
    WHERE p.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);
    UPDATE purchase_orders p SET supplier_name = v_name
    WHERE p.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);
    GET DIAGNOSTICS v_rc = ROW_COUNT; v_purch := v_purch + v_rc;

    -- NICKNAMES: delete-then-insert (UPDATE of client_id is blocked by trigger)
    FOR n IN
      SELECT bn.* FROM client_binance_nicknames bn
      WHERE bn.client_id = r.client_uuid
        AND lower(btrim(bn.nickname)) IN (
          SELECT lower(btrim(c.nickname)) FROM cp_order_identity c
          WHERE c.cp_userno = r.resolved_userno AND coalesce(btrim(c.nickname),'')<>''
            AND c.nickname NOT ILIKE 'P2P-%' AND c.nickname NOT ILIKE 'User-%')
        AND lower(btrim(bn.nickname)) IN (
          SELECT nk FROM (
            SELECT lower(btrim(c2.nickname)) nk, count(DISTINCT c2.cp_userno) u
            FROM cp_order_identity c2
            WHERE coalesce(btrim(c2.nickname),'')<>'' AND c2.nickname NOT ILIKE 'P2P-%' AND c2.nickname NOT ILIKE 'User-%'
            GROUP BY 1) z WHERE z.u = 1)
    LOOP
      INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, new_value)
      VALUES (v_batch, 'nickname', n.nickname, n.client_id, v_target_id, v_name);
      DELETE FROM client_binance_nicknames WHERE id = n.id;
      INSERT INTO client_binance_nicknames(client_id, nickname, is_active, source, first_seen_at, last_seen_at, created_at)
      VALUES (v_target_id, n.nickname, n.is_active, COALESCE(n.source,'phase3a_demerge'), n.first_seen_at, n.last_seen_at, n.created_at);
      v_nicks := v_nicks + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_batch, v_clients, v_skipped, v_collision, v_sales, v_purch, v_nicks;
END;
$$;