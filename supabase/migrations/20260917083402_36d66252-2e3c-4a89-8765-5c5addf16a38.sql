-- ===== text/amount normalisers =====
CREATE OR REPLACE FUNCTION public.cbt_norm_text(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(btrim(coalesce(p,'')), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.cbt_norm_amount(p text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v text; BEGIN
  v := regexp_replace(coalesce(p,''), '[^0-9.\-]', '', 'g');
  IF v = '' OR v = '-' OR v = '.' THEN RETURN NULL; END IF;
  RETURN round(v::numeric, 2);
EXCEPTION WHEN others THEN RETURN NULL; END $$;

-- ===== section config from the frozen blueprint snapshot =====
CREATE OR REPLACE FUNCTION public.cbt_section_config(p_section_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sec_cfg.cfg, '{}'::jsonb)
  FROM public.cbt_attempt_sections s
  JOIN public.cbt_attempts a ON a.id = s.attempt_id
  LEFT JOIN LATERAL (
    SELECT e.value AS cfg
    FROM jsonb_array_elements(COALESCE(a.blueprint_snapshot->'sections','[]'::jsonb)) e
    WHERE (e.value->>'order_index')::int = s.order_index
    LIMIT 1
  ) sec_cfg ON true
  WHERE s.id = p_section_id
$$;

-- ===== score one section =====
CREATE OR REPLACE FUNCTION public.cbt_score_section(p_section_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cbt_attempt_sections;
  cfg jsonb;
  duration numeric;
  neg numeric;
  norm numeric;
  raw numeric := 0;
  maxs numeric := 0;
  gate boolean;
  met jsonb;
  -- typing
  passage text; pwords text[]; cwords text[];
  i int; correct_words int := 0; correct_chars int := 0; total_chars int := 0;
  elapsed numeric; minutes numeric; net numeric; gross numeric; acc numeric;
  -- data entry / objective
  rec record; earned numeric := 0; possible numeric := 0;
  fields jsonb; keyrec jsonb; w numeric; okf boolean;
  fname text;
  n_correct int := 0; n_wrong int := 0; n_total int := 0;
  redflag boolean := false;
  wr_total numeric := 0; wr_count int := 0; wr_pending boolean := false;
BEGIN
  SELECT * INTO s FROM public.cbt_attempt_sections WHERE id = p_section_id;
  IF s.id IS NULL THEN RETURN; END IF;
  cfg := public.cbt_section_config(p_section_id);
  duration := COALESCE((cfg->>'duration_seconds')::numeric, GREATEST(1, EXTRACT(EPOCH FROM (COALESCE(s.deadline_at, now()) - COALESCE(s.started_at, now())))));
  neg := COALESCE((cfg->>'negative_mark')::numeric, 0);
  met := COALESCE(s.metrics, '{}'::jsonb);

  IF s.section_type = 'typing' THEN
    SELECT qv.content->>'passage' INTO passage
      FROM public.cbt_attempt_items ai JOIN public.cbt_question_versions qv ON qv.id = ai.question_version_id
     WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order LIMIT 1;
    pwords := regexp_split_to_array(public.cbt_norm_text(passage), ' ');
    SELECT COALESCE(array_agg(x ORDER BY ord), '{}'::text[]) INTO cwords
      FROM jsonb_array_elements_text(COALESCE(met->'committed_words','[]'::jsonb)) WITH ORDINALITY t(x, ord);
    IF passage IS NULL OR array_length(pwords,1) IS NULL THEN pwords := '{}'::text[]; END IF;

    FOR i IN 1..COALESCE(array_length(cwords,1),0) LOOP
      total_chars := total_chars + length(cwords[i]) + 1;
      IF i <= COALESCE(array_length(pwords,1),0) AND cwords[i] = pwords[i] THEN
        correct_words := correct_words + 1;
        correct_chars := correct_chars + length(cwords[i]) + 1;
      END IF;
    END LOOP;

    elapsed := COALESCE((met->>'elapsed_seconds')::numeric, duration);
    IF COALESCE(array_length(cwords,1),0) >= COALESCE(array_length(pwords,1),0)
       AND COALESCE(array_length(pwords,1),0) > 0 THEN
      minutes := GREATEST(elapsed, 1) / 60.0;
    ELSE
      minutes := duration / 60.0;
    END IF;

    IF COALESCE(array_length(cwords,1),0) = 0 THEN
      net := 0; gross := 0; acc := 0;
    ELSE
      net := round(((correct_chars / 5.0) / minutes)::numeric, 1);
      gross := round(((total_chars / 5.0) / minutes)::numeric, 1);
      acc := round((correct_words::numeric / array_length(cwords,1) * 100)::numeric, 1);
    END IF;

    norm := LEAST(100, round((net / NULLIF(COALESCE((cfg->>'full_marks_wpm')::numeric, 50),0) * 100)::numeric, 1));
    raw := net; maxs := COALESCE((cfg->>'full_marks_wpm')::numeric, 50);
    IF cfg->>'gate_min_net_wpm' IS NOT NULL OR cfg->>'gate_min_accuracy' IS NOT NULL THEN
      gate := net >= COALESCE((cfg->>'gate_min_net_wpm')::numeric, 0)
          AND acc >= COALESCE((cfg->>'gate_min_accuracy')::numeric, 0);
    END IF;
    met := met || jsonb_build_object('net_wpm', net, 'gross_wpm', gross, 'accuracy', acc,
             'words_committed', COALESCE(array_length(cwords,1),0), 'correct_words', correct_words,
             'passage_words', COALESCE(array_length(pwords,1),0));

  ELSIF s.section_type = 'data_entry' THEN
    FOR rec IN
      SELECT ai.id, ai.response, qv.content
        FROM public.cbt_attempt_items ai JOIN public.cbt_question_versions qv ON qv.id = ai.question_version_id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      keyrec := COALESCE(rec.content->'record', '{}'::jsonb);
      fields := COALESCE(rec.response->'fields', '{}'::jsonb);
      FOREACH fname IN ARRAY ARRAY['name','pan','account_number','ifsc','utr','amount','txn_date'] LOOP
        w := CASE WHEN fname IN ('name','txn_date') THEN 1 ELSE 2 END;
        possible := possible + w;
        okf := false;
        IF fname IN ('name','pan','ifsc') THEN
          okf := lower(public.cbt_norm_text(fields->>fname)) = lower(public.cbt_norm_text(keyrec->>fname))
                 AND public.cbt_norm_text(keyrec->>fname) <> '';
        ELSIF fname IN ('account_number','utr') THEN
          okf := public.cbt_norm_text(fields->>fname) = public.cbt_norm_text(keyrec->>fname)
                 AND public.cbt_norm_text(keyrec->>fname) <> '';
        ELSIF fname = 'amount' THEN
          okf := public.cbt_norm_amount(fields->>fname) IS NOT NULL
                 AND public.cbt_norm_amount(fields->>fname) = public.cbt_norm_amount(keyrec->>fname);
        ELSE
          okf := public.cbt_norm_text(fields->>fname) = public.cbt_norm_text(keyrec->>fname)
                 AND public.cbt_norm_text(keyrec->>fname) ~ '^\d{2}/\d{2}/\d{4}$';
        END IF;
        IF okf THEN earned := earned + w; END IF;
      END LOOP;
      UPDATE public.cbt_attempt_items SET marks_awarded = NULL WHERE id = rec.id;
    END LOOP;
    raw := earned; maxs := possible;
    norm := CASE WHEN possible = 0 THEN 0 ELSE round((earned / possible * 100)::numeric, 1) END;
    met := met || jsonb_build_object('earned_weight', earned, 'possible_weight', possible);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;

  ELSIF s.section_type = 'match_pairs' THEN
    FOR rec IN
      SELECT ai.id, ai.response, k.pair_is_match
        FROM public.cbt_attempt_items ai
        LEFT JOIN public.cbt_question_keys k ON k.question_version_id = ai.question_version_id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1;
      IF rec.response ? 'match' AND (rec.response->>'match')::boolean = COALESCE(rec.pair_is_match, false) THEN
        n_correct := n_correct + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 1, is_correct = true WHERE id = rec.id;
      ELSE
        n_wrong := n_wrong + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 0, is_correct = false WHERE id = rec.id;
      END IF;
    END LOOP;
    raw := n_correct; maxs := n_total;
    norm := CASE WHEN n_total = 0 THEN 0
      ELSE GREATEST(0, round((n_correct::numeric / n_total * 100 - neg * n_wrong)::numeric, 1)) END;
    met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'total', n_total);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;

  ELSIF s.section_type = 'objective' THEN
    FOR rec IN
      SELECT ai.id, ai.response, q.type, k.correct_option_id, k.numeric_answer, k.numeric_tolerance,
             k.sjt_scores, k.red_flag_option_ids
        FROM public.cbt_attempt_items ai
        JOIN public.cbt_question_versions qv ON qv.id = ai.question_version_id
        JOIN public.cbt_questions q ON q.id = qv.question_id
        LEFT JOIN public.cbt_question_keys k ON k.question_version_id = ai.question_version_id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1; maxs := maxs + 1;
      DECLARE m numeric := 0; answered boolean := false; flag boolean := false;
      BEGIN
        IF rec.type = 'mcq' THEN
          answered := rec.response ? 'option_id' AND COALESCE(rec.response->>'option_id','') <> '';
          IF answered AND rec.response->>'option_id' = rec.correct_option_id THEN m := 1; END IF;
        ELSIF rec.type = 'numeric' THEN
          answered := rec.response ? 'value' AND COALESCE(rec.response->>'value','') <> '';
          IF answered AND public.cbt_norm_amount(rec.response->>'value') IS NOT NULL
             AND rec.numeric_answer IS NOT NULL
             AND abs(public.cbt_norm_amount(rec.response->>'value') - rec.numeric_answer) <= COALESCE(rec.numeric_tolerance,0)
          THEN m := 1; END IF;
        ELSIF rec.type = 'sjt' THEN
          answered := rec.response ? 'option_id' AND COALESCE(rec.response->>'option_id','') <> '';
          IF answered THEN
            m := COALESCE((rec.sjt_scores->>(rec.response->>'option_id'))::numeric, 0);
            flag := (rec.response->>'option_id') = ANY (COALESCE(rec.red_flag_option_ids, '{}'::text[]));
          END IF;
        END IF;
        raw := raw + m;
        IF answered AND m = 0 THEN n_wrong := n_wrong + 1; END IF;
        IF m > 0 THEN n_correct := n_correct + 1; END IF;
        IF flag THEN redflag := true; END IF;
        UPDATE public.cbt_attempt_items
           SET marks_awarded = m, is_correct = (m > 0), is_red_flag = flag
         WHERE id = rec.id;
      END;
    END LOOP;
    norm := CASE WHEN maxs = 0 THEN 0
      ELSE GREATEST(0, round((raw / maxs * 100 - neg * n_wrong)::numeric, 1)) END;
    met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'total', n_total, 'red_flag', redflag);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;

  ELSIF s.section_type = 'written' THEN
    FOR rec IN
      SELECT ai.id, e.total
        FROM public.cbt_attempt_items ai
        LEFT JOIN public.cbt_written_evaluations e ON e.attempt_item_id = ai.id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1;
      IF rec.total IS NULL THEN
        wr_pending := true;
      ELSE
        wr_total := wr_total + round((rec.total / 20.0 * 100)::numeric, 1);
        wr_count := wr_count + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = rec.total WHERE id = rec.id;
      END IF;
    END LOOP;
    maxs := n_total * 100;
    raw := wr_total;
    norm := CASE WHEN wr_count = 0 THEN 0 ELSE round((wr_total / wr_count)::numeric, 1) END;
    met := met || jsonb_build_object('graded_items', wr_count, 'total_items', n_total, 'pending_grading', wr_pending);
    IF cfg->>'gate_min_score' IS NOT NULL AND NOT wr_pending THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;
  END IF;

  UPDATE public.cbt_attempt_sections
     SET raw_score = raw, max_score = maxs, normalized_score = norm, gate_passed = gate, metrics = met
   WHERE id = p_section_id;
END $$;

-- ===== finalize =====
CREATE OR REPLACE FUNCTION public.cbt_finalize_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.cbt_attempts;
  r public.cbt_job_roles;
  st jsonb; total numeric; wsum numeric := 0; acc numeric := 0;
  dec public.cbt_decision; reason text;
  failed_gate text; flagged text; pending boolean := false;
  maxw int;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RETURN; END IF;
  IF a.decision_source = 'manual' THEN RETURN; END IF;
  SELECT * INTO r FROM public.cbt_job_roles WHERE id = a.job_role_id;
  SELECT max_warnings INTO maxw FROM public.cbt_settings WHERE id;

  SELECT SUM(COALESCE(s.normalized_score,0) * COALESCE((public.cbt_section_config(s.id)->>'weight')::numeric,0)),
         SUM(COALESCE((public.cbt_section_config(s.id)->>'weight')::numeric,0))
    INTO acc, wsum
    FROM public.cbt_attempt_sections s WHERE s.attempt_id = a.id;
  total := CASE WHEN COALESCE(wsum,0) = 0 THEN 0 ELSE round((acc / wsum)::numeric, 1) END;

  SELECT s.section_code INTO failed_gate FROM public.cbt_attempt_sections s
   WHERE s.attempt_id = a.id AND s.gate_passed IS FALSE ORDER BY s.order_index LIMIT 1;
  SELECT s.section_code INTO flagged FROM public.cbt_attempt_sections s
   JOIN public.cbt_attempt_items i ON i.attempt_section_id = s.id
   WHERE s.attempt_id = a.id AND i.is_red_flag ORDER BY s.order_index LIMIT 1;
  SELECT EXISTS (
    SELECT 1 FROM public.cbt_attempt_sections s
     WHERE s.attempt_id = a.id AND s.section_type = 'written'
       AND COALESCE((s.metrics->>'pending_grading')::boolean, false)
  ) INTO pending;

  IF a.status IN ('abandoned','invalidated') THEN
    dec := 'incomplete';
    reason := CASE WHEN a.status = 'abandoned' THEN 'Abandoned'
                   ELSE 'Invalidated: ' || COALESCE(a.auto_submit_reason,'no reason recorded') END;
  ELSIF a.status = 'auto_submitted' AND a.auto_submit_reason = 'warning_limit' THEN
    dec := 'hold'; reason := format('Proctoring review: auto-submitted after %s warnings', a.warning_count);
  ELSIF failed_gate IS NOT NULL THEN
    dec := 'rejected'; reason := 'Gate failed: ' || failed_gate;
  ELSIF flagged IS NOT NULL THEN
    dec := 'hold'; reason := 'Integrity review: red-flag answer in ' || flagged;
  ELSIF a.warning_count > COALESCE(maxw, 3) THEN
    dec := 'hold'; reason := format('Proctoring review: %s warnings', a.warning_count);
  ELSIF pending THEN
    dec := 'pending_evaluation'; reason := 'Written answers awaiting evaluation';
  ELSIF total >= r.shortlist_cutoff THEN
    dec := 'shortlisted'; reason := format('Total %s met the shortlist cut-off of %s', total, r.shortlist_cutoff);
  ELSIF total >= r.hold_cutoff THEN
    dec := 'hold'; reason := format('Total %s met the hold cut-off of %s', total, r.hold_cutoff);
  ELSE
    dec := 'rejected'; reason := format('Total %s below the hold cut-off of %s', total, r.hold_cutoff);
  END IF;

  UPDATE public.cbt_attempts
     SET total_score = total, decision = dec, decision_reason = reason, decision_source = 'auto'
   WHERE id = a.id;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_rescore_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.cbt_can_manage() THEN
    RAISE EXCEPTION 'Not permitted to re-score attempts';
  END IF;
  FOR sid IN SELECT id FROM public.cbt_attempt_sections WHERE attempt_id = p_attempt_id
             AND status IN ('submitted','auto_submitted') ORDER BY order_index LOOP
    PERFORM public.cbt_score_section(sid);
  END LOOP;
  PERFORM public.cbt_finalize_attempt(p_attempt_id);
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, reason)
  VALUES (auth.uid(), 'cbt_attempts', p_attempt_id, 'rescore', 'Manual or key-correction re-score');
END $$;

-- ===== sweep =====
CREATE OR REPLACE FUNCTION public.cbt_sweep_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.cbt_attempts; cfgset public.cbt_settings; s record; cfg jsonb; nxt record; changed boolean := false;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL OR a.status NOT IN ('registered','in_progress') THEN RETURN; END IF;
  SELECT * INTO cfgset FROM public.cbt_settings WHERE id;

  -- expire sections past deadline + grace
  FOR s IN SELECT * FROM public.cbt_attempt_sections
            WHERE attempt_id = a.id AND status = 'in_progress'
              AND deadline_at IS NOT NULL
              AND now() > deadline_at + make_interval(secs => COALESCE(cfgset.deadline_grace_seconds,5))
  LOOP
    UPDATE public.cbt_attempt_sections
       SET status = 'auto_submitted', submitted_at = now(),
           metrics = COALESCE(metrics,'{}'::jsonb) || jsonb_build_object('auto_submit_reason','deadline')
     WHERE id = s.id;
    PERFORM public.cbt_score_section(s.id);
    changed := true;
  END LOOP;

  -- auto-start typing timer if the candidate never pressed Start
  FOR s IN SELECT * FROM public.cbt_attempt_sections
            WHERE attempt_id = a.id AND status = 'pending' AND section_type = 'typing'
              AND entered_at IS NOT NULL
  LOOP
    cfg := public.cbt_section_config(s.id);
    IF now() > s.entered_at + make_interval(secs => COALESCE((cfg->>'practice_seconds')::int,0) + 60) THEN
      UPDATE public.cbt_attempt_sections
         SET status = 'in_progress', started_at = now(),
             deadline_at = now() + make_interval(secs => COALESCE((cfg->>'duration_seconds')::int, 180)
               + COALESCE((SELECT SUM(seconds) FROM public.cbt_time_extensions WHERE attempt_section_id = s.id),0))
       WHERE id = s.id;
      changed := true;
    END IF;
  END LOOP;

  -- advance to the next section after the transition window
  IF a.status = 'in_progress'
     AND NOT EXISTS (SELECT 1 FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status = 'in_progress') THEN
    SELECT * INTO nxt FROM public.cbt_attempt_sections
      WHERE attempt_id = a.id AND status = 'pending' AND section_type <> 'typing' ORDER BY order_index LIMIT 1;
    IF nxt.id IS NOT NULL AND nxt.entered_at IS NOT NULL
       AND now() > nxt.entered_at + make_interval(secs => COALESCE(cfgset.transition_seconds,60)) THEN
      cfg := public.cbt_section_config(nxt.id);
      UPDATE public.cbt_attempt_sections
         SET status = 'in_progress', started_at = now(),
             deadline_at = now() + make_interval(secs => COALESCE((cfg->>'duration_seconds')::int, 300))
       WHERE id = nxt.id;
      UPDATE public.cbt_attempts SET current_section_index = nxt.order_index WHERE id = a.id;
      changed := true;
    END IF;
  END IF;

  -- abandonment
  IF a.status = 'in_progress' AND a.last_heartbeat_at IS NOT NULL
     AND now() > a.last_heartbeat_at + make_interval(mins => COALESCE(cfgset.abandon_after_minutes,20)) THEN
    UPDATE public.cbt_attempt_sections
       SET status = 'auto_submitted', submitted_at = now()
     WHERE attempt_id = a.id AND status IN ('pending','in_progress');
    FOR s IN SELECT id FROM public.cbt_attempt_sections WHERE attempt_id = a.id ORDER BY order_index LOOP
      PERFORM public.cbt_score_section(s.id);
    END LOOP;
    UPDATE public.cbt_attempts SET status = 'abandoned', submitted_at = now() WHERE id = a.id;
    changed := true;
  END IF;

  -- all sections done -> submit
  IF (SELECT COUNT(*) FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status IN ('pending','in_progress')) = 0
     AND a.status = 'in_progress' THEN
    UPDATE public.cbt_attempts SET status = 'submitted', submitted_at = COALESCE(submitted_at, now()) WHERE id = a.id;
    changed := true;
  END IF;

  IF changed THEN PERFORM public.cbt_finalize_attempt(a.id); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_sweep_expired()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; r record; BEGIN
  FOR r IN SELECT DISTINCT a.id FROM public.cbt_attempts a
            WHERE a.status IN ('registered','in_progress') LOOP
    PERFORM public.cbt_sweep_attempt(r.id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_retention_purge()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE days int; n int; BEGIN
  SELECT retention_days INTO days FROM public.cbt_settings WHERE id;
  days := COALESCE(days, 180);
  WITH latest AS (
    SELECT c.id, MAX(a.created_at) AS last_at,
           BOOL_OR(a.decision = 'shortlisted') AS ever_shortlisted, c.is_internal
      FROM public.cbt_candidates c LEFT JOIN public.cbt_attempts a ON a.candidate_id = c.id
     WHERE c.anonymized_at IS NULL
     GROUP BY c.id, c.is_internal
  ), target AS (
    SELECT id FROM latest
     WHERE COALESCE(last_at, now() - interval '1000 days') < now() - make_interval(days => days)
       AND (is_internal OR NOT COALESCE(ever_shortlisted, false))
  )
  UPDATE public.cbt_candidates c
     SET full_name = 'Anonymised candidate', mobile = NULL, email = NULL, city = NULL, anonymized_at = now()
   WHERE c.id IN (SELECT id FROM target);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.cbt_audit_log (entity, action, reason, after)
  VALUES ('cbt_candidates', 'retention_purge', format('Anonymised %s candidate records older than %s days', n, days),
          jsonb_build_object('count', n));
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.cbt_score_section(uuid), public.cbt_finalize_attempt(uuid),
  public.cbt_sweep_attempt(uuid), public.cbt_sweep_expired(), public.cbt_retention_purge(),
  public.cbt_section_config(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cbt_rescore_attempt(uuid) FROM anon;