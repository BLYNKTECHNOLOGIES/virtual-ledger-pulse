DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.cbt_score_section(uuid)'::regprocedure);
  src := replace(src, $a$IF NOT (rec.response ? 'match') OR jsonb_typeof(rec.response->'match') <> 'boolean' THEN$a$,
                      $b$IF COALESCE(jsonb_typeof(rec.response->'match'), 'null') <> 'boolean' THEN$b$);
  IF position($b$COALESCE(jsonb_typeof(rec.response->'match'), 'null') <> 'boolean'$b$ in src) = 0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE src;
END $do$;