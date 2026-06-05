DO $$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'delete_user_with_cleanup'
    AND pg_get_function_arguments(p.oid) = 'p_user_id uuid';

  IF fn IS NULL THEN
    RAISE EXCEPTION 'public.delete_user_with_cleanup(p_user_id uuid) not found';
  END IF;

  fn := replace(
    fn,
    '  UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_reviews SET read_by = NULL WHERE read_by = p_user_id;
  UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = p_user_id;',
    '  IF to_regclass(''public.purchase_order_reviews'') IS NOT NULL THEN
    EXECUTE ''UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = $1'' USING p_user_id;
    EXECUTE ''UPDATE public.purchase_order_reviews SET read_by = NULL WHERE read_by = $1'' USING p_user_id;
  END IF;
  IF to_regclass(''public.purchase_order_status_history'') IS NOT NULL THEN
    EXECUTE ''UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = $1'' USING p_user_id;
  END IF;'
  );

  IF fn LIKE '%UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = p_user_id;%'
     OR fn LIKE '%UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = p_user_id;%' THEN
    RAISE EXCEPTION 'Failed to replace legacy purchase order cleanup statements';
  END IF;

  EXECUTE fn;
END $$;