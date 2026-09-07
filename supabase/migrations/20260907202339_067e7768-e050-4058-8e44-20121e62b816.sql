CREATE OR REPLACE FUNCTION public.mark_terminal_binance_chat_read(p_order_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF p_order_number IS NULL OR p_order_number = '' THEN RETURN; END IF;

  SELECT nullif(btrim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '')
    INTO v_name
  FROM public.users u
  WHERE u.id = auth.uid();

  INSERT INTO public.terminal_binance_chat_reads (order_number, last_read_at, read_by_user_id, read_by_name)
  VALUES (p_order_number, now(), auth.uid(), v_name)
  ON CONFLICT (order_number) DO UPDATE
    SET last_read_at = now(),
        read_by_user_id = auth.uid(),
        read_by_name = coalesce(v_name, public.terminal_binance_chat_reads.read_by_name),
        updated_at = now();
END;
$function$;

UPDATE public.terminal_binance_chat_reads r
SET read_by_name = nullif(btrim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '')
FROM public.users u
WHERE u.id = r.read_by_user_id
  AND r.read_by_name IS NULL;