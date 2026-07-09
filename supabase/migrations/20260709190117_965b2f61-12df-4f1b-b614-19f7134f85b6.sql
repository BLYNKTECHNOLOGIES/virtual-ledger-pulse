CREATE TABLE IF NOT EXISTS public.client_demerge_rollback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_ref text NOT NULL,
  old_client_id uuid,
  new_client_id uuid,
  old_value text,
  new_value text,
  reverted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_demerge_rollback_log TO authenticated;
GRANT ALL ON public.client_demerge_rollback_log TO service_role;
ALTER TABLE public.client_demerge_rollback_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read demerge log" ON public.client_demerge_rollback_log;
CREATE POLICY "authenticated read demerge log" ON public.client_demerge_rollback_log
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.phase3a_demerge()
RETURNS TABLE(out_batch_id uuid, clients_created int, sales_moved int, purchases_moved int, nicknames_moved int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_clients int := 0;
  v_sales int := 0;
  v_purch int := 0;
  v_nicks int := 0;
  v_rc int;
  r record;
  v_name text;
  v_new_id uuid;
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

    SELECT * INTO v_parent FROM clients WHERE id = r.client_uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_is_seller := EXISTS (SELECT 1 FROM purchase_orders p
      WHERE p.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno=r.resolved_userno));
    v_is_buyer := EXISTS (SELECT 1 FROM sales_orders s
      WHERE s.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno=r.resolved_userno));

    SELECT COALESCE(MIN(create_time)::date, CURRENT_DATE) INTO v_onboard
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
    RETURNING id INTO v_new_id;
    v_clients := v_clients + 1;

    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, new_value)
    VALUES (v_batch, 'client_created', v_new_id::text, r.client_uuid, v_new_id, v_name);

    INSERT INTO client_verified_names(client_id, verified_name, source, first_seen_at, last_seen_at, created_at)
    VALUES (v_new_id, v_name, 'phase3a_demerge', now(), now(), now())
    ON CONFLICT DO NOTHING;

    -- SALES: log then reassign
    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, old_value, new_value)
    SELECT v_batch, 'sales_order', s.order_number, s.client_id, v_new_id, s.client_name, v_name
    FROM sales_orders s
    WHERE s.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);

    UPDATE sales_orders s
    SET client_id = v_new_id, client_name = v_name
    WHERE s.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_sales := v_sales + v_rc;

    -- PURCHASES: log then reassign supplier_name (attribution only)
    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, old_value, new_value)
    SELECT v_batch, 'purchase_order', p.order_number, NULL, v_new_id, p.supplier_name, v_name
    FROM purchase_orders p
    WHERE p.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);

    UPDATE purchase_orders p
    SET supplier_name = v_name
    WHERE p.order_number IN (SELECT order_number FROM cp_order_identity c WHERE c.cp_userno = r.resolved_userno);
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_purch := v_purch + v_rc;

    -- NICKNAMES: move only real nicknames uniquely tied to this userNo
    INSERT INTO client_demerge_rollback_log(batch_id, entity_type, entity_ref, old_client_id, new_client_id, new_value)
    SELECT v_batch, 'nickname', bn.nickname, bn.client_id, v_new_id, v_name
    FROM client_binance_nicknames bn
    WHERE bn.client_id = r.client_uuid
      AND lower(btrim(bn.nickname)) IN (
        SELECT lower(btrim(c.nickname)) FROM cp_order_identity c
        WHERE c.cp_userno = r.resolved_userno AND coalesce(btrim(c.nickname),'')<>''
          AND c.nickname NOT ILIKE 'P2P-%' AND c.nickname NOT ILIKE 'User-%'
      )
      AND lower(btrim(bn.nickname)) IN (
        SELECT nk FROM (
          SELECT lower(btrim(c2.nickname)) nk, count(DISTINCT c2.cp_userno) u
          FROM cp_order_identity c2
          WHERE coalesce(btrim(c2.nickname),'')<>'' AND c2.nickname NOT ILIKE 'P2P-%' AND c2.nickname NOT ILIKE 'User-%'
          GROUP BY 1
        ) z WHERE z.u = 1
      );

    UPDATE client_binance_nicknames bn
    SET client_id = v_new_id
    WHERE bn.client_id = r.client_uuid
      AND lower(btrim(bn.nickname)) IN (
        SELECT lower(btrim(c.nickname)) FROM cp_order_identity c
        WHERE c.cp_userno = r.resolved_userno AND coalesce(btrim(c.nickname),'')<>''
          AND c.nickname NOT ILIKE 'P2P-%' AND c.nickname NOT ILIKE 'User-%'
      )
      AND lower(btrim(bn.nickname)) IN (
        SELECT nk FROM (
          SELECT lower(btrim(c2.nickname)) nk, count(DISTINCT c2.cp_userno) u
          FROM cp_order_identity c2
          WHERE coalesce(btrim(c2.nickname),'')<>'' AND c2.nickname NOT ILIKE 'P2P-%' AND c2.nickname NOT ILIKE 'User-%'
          GROUP BY 1
        ) z WHERE z.u = 1
      );
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_nicks := v_nicks + v_rc;
  END LOOP;

  RETURN QUERY SELECT v_batch, v_clients, v_sales, v_purch, v_nicks;
END;
$$;

-- Inverse: revert an entire batch
CREATE OR REPLACE FUNCTION public.phase3a_demerge_rollback(p_batch uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE l record;
BEGIN
  FOR l IN SELECT * FROM client_demerge_rollback_log WHERE batch_id=p_batch AND reverted=false ORDER BY id DESC LOOP
    IF l.entity_type='sales_order' THEN
      UPDATE sales_orders SET client_id=l.old_client_id, client_name=l.old_value WHERE order_number=l.entity_ref;
    ELSIF l.entity_type='purchase_order' THEN
      UPDATE purchase_orders SET supplier_name=l.old_value WHERE order_number=l.entity_ref;
    ELSIF l.entity_type='nickname' THEN
      UPDATE client_binance_nicknames SET client_id=l.old_client_id WHERE nickname=l.entity_ref AND client_id=l.new_client_id;
    ELSIF l.entity_type='client_created' THEN
      DELETE FROM client_verified_names WHERE client_id=l.new_client_id AND source='phase3a_demerge';
      UPDATE clients SET is_deleted=true WHERE id=l.new_client_id;
    END IF;
    UPDATE client_demerge_rollback_log SET reverted=true WHERE id=l.id;
  END LOOP;
  RETURN 'Reverted batch '||p_batch;
END;
$$;