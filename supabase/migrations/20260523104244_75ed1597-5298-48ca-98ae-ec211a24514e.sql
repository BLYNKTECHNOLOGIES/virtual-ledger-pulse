
CREATE OR REPLACE FUNCTION public.reconcile_terminal_sync_cancellations(p_order_number text DEFAULT NULL)
RETURNS TABLE(table_name text, voided_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buy_count bigint := 0;
  v_sell_count bigint := 0;
BEGIN
  WITH upd AS (
    UPDATE public.terminal_purchase_sync tps
       SET sync_status = 'cancelled_on_binance',
           reviewed_at = now(),
           rejection_reason = COALESCE(tps.rejection_reason, 'Auto-voided: order cancelled on Binance')
      FROM public.binance_order_history boh
     WHERE boh.order_number = tps.binance_order_number
       AND tps.sync_status IN ('synced_pending_approval', 'client_mapping_pending')
       AND boh.order_status IN ('CANCELLED', 'CANCELLED_BY_SYSTEM', '5', '6', '7')
       AND (p_order_number IS NULL OR tps.binance_order_number = p_order_number)
    RETURNING tps.id
  )
  SELECT count(*) INTO v_buy_count FROM upd;

  WITH upd AS (
    UPDATE public.terminal_sales_sync tss
       SET sync_status = 'cancelled_on_binance',
           reviewed_at = now(),
           rejection_reason = COALESCE(tss.rejection_reason, 'Auto-voided: order cancelled on Binance')
      FROM public.binance_order_history boh
     WHERE boh.order_number = tss.binance_order_number
       AND tss.sync_status IN ('synced_pending_approval', 'client_mapping_pending')
       AND boh.order_status IN ('CANCELLED', 'CANCELLED_BY_SYSTEM', '5', '6', '7')
       AND (p_order_number IS NULL OR tss.binance_order_number = p_order_number)
    RETURNING tss.id
  )
  SELECT count(*) INTO v_sell_count FROM upd;

  RETURN QUERY VALUES
    ('terminal_purchase_sync'::text, v_buy_count),
    ('terminal_sales_sync'::text, v_sell_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_terminal_sync_cancellations(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_void_sync_on_binance_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_status IN ('CANCELLED', 'CANCELLED_BY_SYSTEM', '5', '6', '7')
     AND (TG_OP = 'INSERT' OR NEW.order_status IS DISTINCT FROM OLD.order_status) THEN

    UPDATE public.terminal_purchase_sync
       SET sync_status = 'cancelled_on_binance',
           reviewed_at = now(),
           rejection_reason = COALESCE(rejection_reason, 'Auto-voided: order cancelled on Binance')
     WHERE binance_order_number = NEW.order_number
       AND sync_status IN ('synced_pending_approval', 'client_mapping_pending');

    UPDATE public.terminal_sales_sync
       SET sync_status = 'cancelled_on_binance',
           reviewed_at = now(),
           rejection_reason = COALESCE(rejection_reason, 'Auto-voided: order cancelled on Binance')
     WHERE binance_order_number = NEW.order_number
       AND sync_status IN ('synced_pending_approval', 'client_mapping_pending');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS void_sync_on_binance_cancel ON public.binance_order_history;
CREATE TRIGGER void_sync_on_binance_cancel
AFTER INSERT OR UPDATE OF order_status ON public.binance_order_history
FOR EACH ROW
EXECUTE FUNCTION public.trg_void_sync_on_binance_cancel();

SELECT public.reconcile_terminal_sync_cancellations(NULL);
