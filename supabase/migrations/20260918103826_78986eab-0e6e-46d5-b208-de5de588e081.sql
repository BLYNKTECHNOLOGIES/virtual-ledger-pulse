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
  passage text; pwords text[]; cwords text[];
  i int; correct_words int := 0; correct_chars int := 0; total_chars int := 0;
  elapsed numeric; minutes numeric; net numeric; gross numeric; acc numeric;
  rec record; earned numeric := 0; possible numeric := 0;
  fields jsonb; keyrec jsonb; w numeric; okf boolean;
  fname text;
  n_correct int := 0; n_wrong int := 0; n_total int := 0;
  redflag boolean := false;
  wr_total numeric := 0; wr_count int := 0; wr_pending boolean := false;
BEGIN
  SELECT * INTO s FROM public.cbt_attempt_sections WHERE id = p_section_id;
  IF s.id IS NULL THEN RETURN; END IF;

  -- Skill Box drills are generated per attempt and scored separately
  IF s.section_type IN ('mental_maths', 'memory_recall') THEN
    PERFORM public.cbt_score_skill_section(p_section_id);
    RETURN;
  END IF;

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
    INSERT INTO public.cbt_written_evaluations (attempt_item_id)
    SELECT ai.id FROM public.cbt_attempt_items ai
     WHERE ai.attempt_section_id = s.id
    ON CONFLICT (attempt_item_id) DO NOTHING;

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