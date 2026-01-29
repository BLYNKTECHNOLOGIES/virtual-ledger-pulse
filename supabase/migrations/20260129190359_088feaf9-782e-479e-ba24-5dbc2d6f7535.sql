-- Fix trigger function: remove reference to non-existent OLD.customer_name

CREATE OR REPLACE FUNCTION public.cleanup_orphan_client_on_sales_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  client_name_to_check text;
BEGIN
  -- Get the client name from the deleted sales order (only client_name exists)
  client_name_to_check := OLD.client_name;
  
  -- Check and delete orphan client if this was their only order
  IF client_name_to_check IS NOT NULL AND client_name_to_check != '' THEN
    PERFORM public.maybe_delete_orphan_client(client_name_to_check);
  END IF;
  
  RETURN OLD;
END;
$function$;