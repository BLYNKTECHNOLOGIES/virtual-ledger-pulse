-- Sales orders: client link comes from the approved Terminal sync (Binance userNo), never a guessed name.
CREATE OR REPLACE FUNCTION public.auto_fill_sales_order_client_id()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_count int;
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Terminal sales: the sync row's client (resolved by Binance userNo) is the only identity.
  IF NEW.terminal_sync_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id FROM public.terminal_sales_sync WHERE id = NEW.terminal_sync_id;
    IF v_client_id IS NOT NULL THEN
      NEW.client_id := v_client_id;
    END IF;
    RETURN NEW;  -- never fall back to names for Terminal orders
  END IF;

  -- Manual entries: fill by name only when exactly one active client has that name.
  IF NEW.client_name IS NOT NULL THEN
    SELECT count(*), min(id::text)::uuid INTO v_count, v_client_id
    FROM public.clients
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name)) AND is_deleted = false;
    IF v_count = 1 THEN
      NEW.client_id := v_client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;