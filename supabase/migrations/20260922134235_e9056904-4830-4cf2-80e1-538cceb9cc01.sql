CREATE OR REPLACE FUNCTION public.fn_reconcile_pending_spot_trade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_placeholder_ids uuid[];
  v_repointed int := 0;
BEGIN
  IF NEW.binance_trade_id IS NULL OR NEW.binance_trade_id LIKE 'pending_%' THEN
    RETURN NEW;
  END IF;
  IF NEW.binance_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(id) INTO v_placeholder_ids
  FROM public.spot_trade_history
  WHERE binance_order_id = NEW.binance_order_id
    AND binance_trade_id LIKE 'pending_%'
    AND id <> NEW.id;

  IF v_placeholder_ids IS NULL OR array_length(v_placeholder_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Re-point any conversion booked against a placeholder to the real synced row
  -- FIRST. Without this the placeholder delete below violated
  -- erp_product_conversions_spot_trade_id_fkey, which aborted the entire trade
  -- import batch and silently stopped all new conversion entries.
  UPDATE public.erp_product_conversions
     SET spot_trade_id = NEW.id
   WHERE spot_trade_id = ANY(v_placeholder_ids)
     AND NOT EXISTS (
       SELECT 1 FROM public.erp_product_conversions c2
       WHERE c2.spot_trade_id = NEW.id
     );
  v_repointed := COALESCE(ROW_COUNT_SAFE(), 0);

  -- Any conversion still left on a placeholder (because the real row is already
  -- booked) is detached rather than blocking the cleanup.
  UPDATE public.erp_product_conversions
     SET spot_trade_id = NULL
   WHERE spot_trade_id = ANY(v_placeholder_ids);

  WITH deleted AS (
    DELETE FROM public.spot_trade_history
    WHERE id = ANY(v_placeholder_ids)
    RETURNING id, binance_trade_id, quantity, quote_quantity
  )
  INSERT INTO public.adjustment_posting_audit
    (wallet_id, wallet_name, asset_code, transaction_type, amount,
     reference_type, description, notes, posted_by)
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    'spot_trade_history',
    'TRADE',
    'DEDUP',
    COALESCE(quantity, 0),
    'PENDING_TRADE_RECONCILED',
    'Removed pending placeholder ' || binance_trade_id
      || ' (binance_order_id=' || NEW.binance_order_id || ')',
    'Replaced by synced row id=' || NEW.id::text
      || ' binance_trade_id=' || NEW.binance_trade_id
      || '; conversions re-pointed=' || v_repointed::text,
    NULL
  FROM deleted;

  RETURN NEW;
END;
$function$;