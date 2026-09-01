DO $do$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='hr_v4_recompute_range';

  v_old := 'AND d.status NOT IN (''no_data'',''incomplete'',''in_progress'',''present'',''half_day'',''absent'')';
  v_new := 'AND d.status NOT IN (''no_data'',''incomplete'',''in_progress'')';

  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'anchor not found'; END IF;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END $do$;