CREATE OR REPLACE FUNCTION public.normalize_terminal_sales_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_binance_no text;
BEGIN
  IF NEW.terminal_sync_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT binance_order_number INTO v_binance_no
  FROM public.terminal_sales_sync
  WHERE id = NEW.terminal_sync_id;

  IF v_binance_no IS NULL OR length(trim(v_binance_no)) = 0 THEN
    RETURN NEW;
  END IF;

  -- Always anchor the ERP order number to the FULL Binance order number.
  -- Legacy/stale clients truncate to the last 12 digits, which collides across
  -- distinct Binance orders and surfaces as a false "Duplicate Entry".
  NEW.order_number := 'SO-TRM-' || trim(v_binance_no);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_terminal_sales_order_number ON public.sales_orders;
CREATE TRIGGER trg_normalize_terminal_sales_order_number
BEFORE INSERT ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_terminal_sales_order_number();