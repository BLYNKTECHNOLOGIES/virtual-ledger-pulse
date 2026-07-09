CREATE OR REPLACE FUNCTION public.phase3a_demerge_rollback(p_batch uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record;
BEGIN
  FOR l IN SELECT * FROM client_demerge_rollback_log WHERE batch_id=p_batch AND reverted=false ORDER BY id DESC LOOP
    IF l.entity_type='sales_order' THEN
      UPDATE sales_orders SET client_id=l.old_client_id, client_name=l.old_value WHERE order_number=l.entity_ref;
    ELSIF l.entity_type='purchase_order' THEN
      UPDATE purchase_orders SET supplier_name=l.old_value WHERE order_number=l.entity_ref;
    ELSIF l.entity_type='nickname' THEN
      -- The reassignment-block trigger forbids UPDATE of client_id; mirror the
      -- delete-then-insert pattern used by phase3a_demerge to move it back.
      DELETE FROM client_binance_nicknames
        WHERE nickname=l.entity_ref AND client_id=l.new_client_id;
      INSERT INTO client_binance_nicknames (nickname, client_id, source, is_active, first_seen_at, last_seen_at)
        VALUES (l.entity_ref, l.old_client_id, 'phase3a_rollback', true, now(), now())
      ON CONFLICT (nickname) DO UPDATE SET client_id=EXCLUDED.client_id, is_active=true;
    ELSIF l.entity_type='client_created' THEN
      DELETE FROM client_verified_names WHERE client_id=l.new_client_id AND source='phase3a_demerge';
      UPDATE clients SET is_deleted=true WHERE id=l.new_client_id;
    END IF;
    UPDATE client_demerge_rollback_log SET reverted=true WHERE id=l.id;
  END LOOP;
  RETURN 'Reverted batch '||p_batch;
END;
$function$;