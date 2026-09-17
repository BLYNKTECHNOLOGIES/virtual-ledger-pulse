DO $$
DECLARE
  fn regprocedure;
BEGIN
  SELECT p.oid::regprocedure INTO fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_counterparty_completed_order_count'
  LIMIT 1;
  IF fn IS NULL THEN RAISE EXCEPTION 'counterparty count function missing'; END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
END $$;