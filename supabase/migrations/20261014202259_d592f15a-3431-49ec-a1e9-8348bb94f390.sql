-- QZ1.2b: abandonment was immediately overwritten by the "all sections done -> submitted" step in the same sweep
DO $mig$
DECLARE def text; needle text := $$UPDATE public.cbt_attempts SET status = 'abandoned', submitted_at = now() WHERE id = a.id;$$;
BEGIN
  SELECT pg_get_functiondef('public.cbt_sweep_attempt(uuid)'::regprocedure) INTO def;
  IF position(needle IN def) = 0 THEN RAISE EXCEPTION 'cbt_sweep_attempt: abandonment step not found'; END IF;
  def := replace(def, needle, needle || E'\n    a.status := ''abandoned'';');
  EXECUTE def;
END $mig$;