-- Fix orphan-client cleanup function: remove reference to non-existent sales_orders.customer_name

CREATE OR REPLACE FUNCTION public.maybe_delete_orphan_client(client_name_param text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  client_record RECORD;
  sales_count integer;
  purchase_count integer;
BEGIN
  -- Find the client by name
  SELECT * INTO client_record
  FROM public.clients
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(client_name_param));

  IF NOT FOUND THEN
    RETURN; -- No client found, nothing to do
  END IF;

  -- Count remaining sales orders for this client
  SELECT COUNT(*) INTO sales_count
  FROM public.sales_orders
  WHERE LOWER(TRIM(COALESCE(client_name, ''))) = LOWER(TRIM(client_name_param));

  -- Count remaining purchase orders for this client
  SELECT COUNT(*) INTO purchase_count
  FROM public.purchase_orders
  WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM(client_name_param));

  -- If no orders remain, delete the client
  IF sales_count = 0 AND purchase_count = 0 THEN
    DELETE FROM public.clients WHERE id = client_record.id;
  END IF;
END;
$function$;