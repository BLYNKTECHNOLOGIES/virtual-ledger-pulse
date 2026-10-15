CREATE OR REPLACE FUNCTION pg_temp.patch(def text, old text, new text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int := (length(def) - length(replace(def, old, ''))) / greatest(length(old),1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'QZ7b patch anchor found % times: %', n, left(old, 120); END IF;
  RETURN replace(def, old, new);
END $$;

-- blind grading: candidate's own name parts → [name]
CREATE OR REPLACE FUNCTION public.cbt_masked_answer(p_item uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t text; nm text; part text;
BEGIN
  SELECT COALESCE(i.response->>'text',''), c.full_name INTO t, nm
    FROM public.cbt_attempt_items i JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
    JOIN public.cbt_attempts a ON a.id = s.attempt_id LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id
   WHERE i.id = p_item;
  FOR part IN SELECT DISTINCT x FROM regexp_split_to_table(COALESCE(nm,''), '[^[:alpha:]]+') x WHERE length(x) >= 3 LOOP
    t := regexp_replace(t, '\m' || part || '\M', '[name]', 'gi');
  END LOOP;
  RETURN COALESCE(t, '');
END $$;
REVOKE ALL ON FUNCTION public.cbt_masked_answer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_masked_answer(uuid) TO service_role;

DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.cbt_grading_queue(text)'::regprocedure);
  d := pg_temp.patch(d, '''answer'', COALESCE(i.response->>''text'','''')', '''answer'', public.cbt_masked_answer(i.id)');
  EXECUTE d;
  d := pg_get_functiondef('public.cbt_ai_claim(integer)'::regprocedure);
  d := pg_temp.patch(d, '''answer'', COALESCE(i.response->>''text'','''')', '''answer'', public.cbt_masked_answer(i.id)');
  EXECUTE d;
  -- never-started registrations read "Not started"
  d := pg_get_functiondef('public.cbt_finalize_attempt(uuid)'::regprocedure);
  d := pg_temp.patch(d, 'reason := CASE WHEN a.status = ''abandoned'' THEN ''Abandoned''',
                        'reason := CASE WHEN a.status = ''abandoned'' AND a.auto_submit_reason = ''not_started'' THEN ''Not started'' WHEN a.status = ''abandoned'' THEN ''Abandoned''');
  EXECUTE d;
  -- key corrections also reach submitted sections of running attempts
  d := pg_get_functiondef('public.cbt_question_rescore_targets(uuid)'::regprocedure);
  d := pg_temp.patch(d, '    AND a.status IN (''submitted'',''auto_submitted'',''abandoned'')',
                        '    AND (a.status IN (''submitted'',''auto_submitted'',''abandoned'') OR (a.status = ''in_progress'' AND s.status IN (''submitted'',''auto_submitted'')))');
  EXECUTE d;
  -- written items stay out of accuracy rankings
  d := pg_get_functiondef('public.cbt_question_bank_analytics()'::regprocedure);
  d := pg_temp.patch(d, 'CASE WHEN coalesce(s.answered_items,0) > 0 THEN round(100.0 * s.correct_items / s.answered_items, 1) END',
                        'CASE WHEN q.type::text <> ''written'' AND coalesce(s.answered_items,0) > 0 THEN round(100.0 * s.correct_items / s.answered_items, 1) END');
  d := pg_temp.patch(d, 'count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL) AS wrong_items',
                        'count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL AND v.content ? ''options'' OR (i.is_correct IS FALSE AND i.response IS NOT NULL AND NOT v.content ? ''prompt'')) AS wrong_items');
  EXECUTE d;
  -- data entry: an item is right only when every field is right
  d := pg_get_functiondef('public.cbt_score_section(uuid)'::regprocedure);
  d := pg_temp.patch(d, '  wr_total numeric := 0;', '  de_start numeric; de_possible numeric;
  wr_total numeric := 0;');
  d := pg_temp.patch(d, '      FOREACH fname IN ARRAY ARRAY[''name'',''pan'',''account_number'',''ifsc'',''utr'',''amount'',''txn_date''] LOOP',
                        '      de_start := earned; de_possible := possible;
      FOREACH fname IN ARRAY ARRAY[''name'',''pan'',''account_number'',''ifsc'',''utr'',''amount'',''txn_date''] LOOP');
  d := pg_temp.patch(d, '      UPDATE public.cbt_attempt_items SET marks_awarded = NULL WHERE id = rec.id;',
                        '      UPDATE public.cbt_attempt_items SET marks_awarded = NULL,
        is_correct = CASE WHEN rec.response IS NULL OR fields = ''{}''::jsonb THEN NULL ELSE (earned - de_start) = (possible - de_possible) END
       WHERE id = rec.id;');
  EXECUTE d;
END $p$;

-- sweep: end no-shows after their token lifetime; running attempts first
CREATE OR REPLACE FUNCTION public.cbt_sweep_expired()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int := 0; r record; BEGIN
  FOR r IN UPDATE public.cbt_attempts SET status = 'abandoned', auto_submit_reason = 'not_started', submitted_at = now()
            WHERE status = 'registered' AND started_at IS NULL AND token_expires_at IS NOT NULL AND token_expires_at < now()
            RETURNING id LOOP
    PERFORM public.cbt_finalize_attempt(r.id);
  END LOOP;
  FOR r IN SELECT a.id FROM public.cbt_attempts a
            WHERE a.status IN ('registered','in_progress')
            ORDER BY (a.status = 'in_progress') DESC, a.last_heartbeat_at NULLS LAST, a.id LIMIT 500 LOOP
    PERFORM 1 FROM public.cbt_attempts WHERE id = r.id FOR UPDATE SKIP LOCKED;
    IF FOUND THEN PERFORM public.cbt_sweep_attempt(r.id); n := n + 1; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.cbt_written_evaluations
              WHERE total IS NULL AND ((ai_status = 'queued' AND ai_next_at <= now())
                 OR (ai_status = 'processing' AND updated_at < now() - interval '10 minutes'))
                AND public.cbt_eval_attempt_ended(attempt_item_id)) THEN
    PERFORM public.cbt_kick_ai_grader();
  END IF;
  RETURN n;
END $function$;