DO $p$ DECLARE d text; old text := 'count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL AND v.content ? ''options'' OR (i.is_correct IS FALSE AND i.response IS NOT NULL AND NOT v.content ? ''prompt'')) AS wrong_items'; BEGIN
  d := pg_get_functiondef('public.cbt_question_bank_analytics()'::regprocedure);
  IF strpos(d, old) = 0 THEN RAISE EXCEPTION 'anchor missing'; END IF;
  EXECUTE replace(d, old, 'count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL) AS wrong_items');
END $p$;