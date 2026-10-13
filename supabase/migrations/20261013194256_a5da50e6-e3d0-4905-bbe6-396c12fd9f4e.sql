DO $do$
DECLARE v text := pg_get_functiondef('public.hr_update_requirement(uuid,jsonb,text)'::regprocedure);
  a text := E'IF v_line IS NOT NULL AND v_moving THEN\n    SELECT * INTO l FROM public.hr_headcount_plans WHERE id = v_line;';
  b text := E'SELECT * INTO l FROM public.hr_headcount_plans WHERE id = v_line;\n  IF v_line IS NOT NULL AND v_moving THEN';
BEGIN
  IF position(a in v) = 0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
  EXECUTE replace(v, a, b);
END $do$;