ALTER TABLE public.terminal_binance_chat_reads
  ADD COLUMN IF NOT EXISTS read_source text NOT NULL DEFAULT 'operator';

CREATE OR REPLACE FUNCTION public.mark_terminal_binance_chat_read(p_order_number text, p_source text DEFAULT 'operator')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_source text := coalesce(nullif(btrim(p_source), ''), 'operator');
BEGIN
  IF p_order_number IS NULL OR p_order_number = '' THEN RETURN; END IF;

  IF v_source = 'binance_app' THEN
    v_name := 'Binance app';
  ELSE
    SELECT nullif(btrim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '')
      INTO v_name
    FROM public.users u
    WHERE u.id = auth.uid();
  END IF;

  INSERT INTO public.terminal_binance_chat_reads (order_number, last_read_at, read_by_user_id, read_by_name, read_source)
  VALUES (p_order_number, now(), CASE WHEN v_source = 'binance_app' THEN NULL ELSE auth.uid() END, v_name, v_source)
  ON CONFLICT (order_number) DO UPDATE
    SET last_read_at = now(),
        read_by_user_id = CASE WHEN v_source = 'binance_app' THEN NULL ELSE auth.uid() END,
        read_by_name = coalesce(v_name, public.terminal_binance_chat_reads.read_by_name),
        read_source = v_source,
        updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_terminal_binance_chats_read(p_order_numbers text[], p_source text DEFAULT 'operator')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n text;
  v_count int := 0;
BEGIN
  IF p_order_numbers IS NULL THEN RETURN 0; END IF;
  FOREACH v_n IN ARRAY p_order_numbers LOOP
    IF v_n IS NOT NULL AND btrim(v_n) <> '' THEN
      PERFORM public.mark_terminal_binance_chat_read(btrim(v_n), p_source);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_terminal_binance_chats_read(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_terminal_binance_chat_read(text, text) TO authenticated;