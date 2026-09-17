DO $$
DECLARE can_anon boolean;
BEGIN
  SELECT has_function_privilege('anon', 'public.get_counterparty_order_history(text,uuid)', 'EXECUTE') INTO can_anon;
  IF can_anon THEN RAISE EXCEPTION 'anonymous execution is still enabled'; END IF;
END $$;