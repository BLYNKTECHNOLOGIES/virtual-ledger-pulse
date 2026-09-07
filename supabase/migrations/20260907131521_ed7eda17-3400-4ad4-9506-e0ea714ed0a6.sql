CREATE OR REPLACE FUNCTION public.create_sales_stock_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_count INT;
  v_product_id UUID;
  v_asset TEXT;
BEGIN
  IF NEW.status = 'COMPLETED' AND (NEW.quantity IS NOT NULL AND NEW.quantity > 0) THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.stock_transactions
    WHERE reference_number = NEW.order_number
      AND transaction_type = 'Sales';

    IF v_existing_count > 0 THEN
      RETURN NEW;
    END IF;

    v_product_id := NEW.product_id;

    -- Terminal-synced sales are inserted without product_id; resolve the traded
    -- asset from the linked Binance sync record so the stock-out row is still written.
    IF v_product_id IS NULL AND NEW.terminal_sync_id IS NOT NULL THEN
      SELECT UPPER(tss.order_data->>'asset') INTO v_asset
      FROM public.terminal_sales_sync tss
      WHERE tss.id = NEW.terminal_sync_id;

      IF v_asset IS NOT NULL AND v_asset <> '' THEN
        SELECT p.id INTO v_product_id FROM public.products p WHERE UPPER(p.code) = v_asset LIMIT 1;
      END IF;
    END IF;

    IF v_product_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.stock_transactions (
      product_id, transaction_type, quantity, unit_price,
      total_amount, reference_number, reason, transaction_date
    ) VALUES (
      v_product_id, 'Sales', -(NEW.quantity),
      COALESCE(NEW.price_per_unit, 0), COALESCE(NEW.total_amount, 0),
      NEW.order_number,
      'Sales Order - ' || NEW.order_number || ' - ' || COALESCE(NEW.client_name, ''),
      COALESCE(NEW.order_date::date, CURRENT_DATE)
    );
  END IF;

  RETURN NEW;
END;
$function$;