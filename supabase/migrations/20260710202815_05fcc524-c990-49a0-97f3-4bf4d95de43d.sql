CREATE OR REPLACE FUNCTION public.merge_shared_userno_clients(p_dry_run boolean DEFAULT true)
RETURNS TABLE(out_userno text, out_survivor_id uuid, out_canonical_name text, out_merged_ids uuid[], out_merged_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_uno record;
  v_survivor uuid;
  v_canon text;
  v_loser record;
  v_merged uuid[];
BEGIN
  CREATE TEMP TABLE _ocu ON COMMIT DROP AS
    SELECT DISTINCT so.client_id, coi.cp_userno AS user_no
    FROM sales_orders so
    JOIN cp_order_identity coi ON coi.order_number = so.order_number
    WHERE so.client_id IS NOT NULL AND coi.cp_userno IS NOT NULL AND coi.cp_userno <> '';

  FOR r_uno IN
    SELECT o.user_no FROM _ocu o GROUP BY o.user_no HAVING COUNT(DISTINCT o.client_id) > 1
  LOOP
    SELECT coi.verified_name INTO v_canon
    FROM sales_orders so
    JOIN cp_order_identity coi ON coi.order_number = so.order_number
    WHERE coi.cp_userno = r_uno.user_no AND coi.verified_name IS NOT NULL AND coi.verified_name <> ''
    GROUP BY coi.verified_name
    ORDER BY COUNT(*) DESC, MAX(coi.create_time) DESC
    LIMIT 1;

    SELECT o.client_id INTO v_survivor
    FROM _ocu o
    JOIN clients c ON c.id = o.client_id
    WHERE o.user_no = r_uno.user_no
    ORDER BY (SELECT COUNT(*) FROM sales_orders s WHERE s.client_id = o.client_id) DESC,
             (c.phone IS NOT NULL) DESC,
             (c.kyc_status = 'VERIFIED') DESC,
             (NOT c.is_deleted) DESC,
             c.created_at ASC
    LIMIT 1;

    v_merged := ARRAY[]::uuid[];

    FOR v_loser IN
      SELECT DISTINCT o.client_id AS id, c.name AS name
      FROM _ocu o JOIN clients c ON c.id = o.client_id
      WHERE o.user_no = r_uno.user_no AND o.client_id <> v_survivor
    LOOP
      v_merged := v_merged || v_loser.id;

      IF NOT p_dry_run THEN
        INSERT INTO client_userno_merge_log(cp_userno, survivor_id, survivor_name, merged_client_id, merged_client_name, canonical_name)
        VALUES (r_uno.user_no, v_survivor, (SELECT name FROM clients WHERE id = v_survivor), v_loser.id, v_loser.name, v_canon);

        UPDATE bank_transactions       SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE client_bank_details     SET client_id = v_survivor WHERE client_id = v_loser.id;
        DELETE FROM client_binance_nicknames WHERE client_id = v_loser.id;
        UPDATE client_communication_logs SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE client_income_details   SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE client_kyc_documents    SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE client_limit_requests   SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE client_operator_notes   SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE ra_assignments          SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE ra_client_remarks       SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE sales_orders            SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE terminal_purchase_sync  SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE terminal_sales_sync     SET client_id = v_survivor WHERE client_id = v_loser.id;
        UPDATE client_onboarding_approvals SET resolved_client_id = v_survivor WHERE resolved_client_id = v_loser.id;

        DELETE FROM client_verified_names l
          WHERE l.client_id = v_loser.id
            AND EXISTS (SELECT 1 FROM client_verified_names s WHERE s.client_id = v_survivor AND s.verified_name = l.verified_name);
        UPDATE client_verified_names SET client_id = v_survivor WHERE client_id = v_loser.id;

        DELETE FROM client_binance_usernos WHERE client_id = v_loser.id;

        UPDATE clients
          SET is_deleted = true, deleted_at = now(),
              name = 'MERGED -> ' || COALESCE(v_canon, name), updated_at = now()
          WHERE id = v_loser.id;
      END IF;
    END LOOP;

    IF NOT p_dry_run THEN
      UPDATE client_binance_usernos SET client_id = v_survivor
        WHERE client_binance_usernos.cp_userno = r_uno.user_no;
      INSERT INTO client_binance_usernos(client_id, cp_userno, source, is_active, first_seen_at, last_seen_at, created_at)
      SELECT v_survivor, r_uno.user_no, 'userno_merge', true, now(), now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM client_binance_usernos b WHERE b.cp_userno = r_uno.user_no);

      IF v_canon IS NOT NULL THEN
        UPDATE clients SET name = v_canon, updated_at = now() WHERE id = v_survivor;
      END IF;
    END IF;

    out_userno := r_uno.user_no;
    out_survivor_id := v_survivor;
    out_canonical_name := v_canon;
    out_merged_ids := v_merged;
    out_merged_count := COALESCE(array_length(v_merged, 1), 0);
    RETURN NEXT;
  END LOOP;
END;
$$;