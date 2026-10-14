
-- QZ3b: test builder, level-aware picking, generated data entry / match pairs, try runs
ALTER TABLE public.cbt_role_sections ADD COLUMN IF NOT EXISTS item_source text NOT NULL DEFAULT 'bank';
ALTER TABLE public.cbt_role_sections DROP CONSTRAINT IF EXISTS cbt_role_sections_item_source_chk;
ALTER TABLE public.cbt_role_sections ADD CONSTRAINT cbt_role_sections_item_source_chk CHECK (item_source IN ('bank','generated','both'));
ALTER TABLE public.cbt_job_roles ADD COLUMN IF NOT EXISTS pool text NOT NULL DEFAULT 'hiring';
ALTER TABLE public.cbt_job_roles DROP CONSTRAINT IF EXISTS cbt_job_roles_pool_chk;
ALTER TABLE public.cbt_job_roles ADD CONSTRAINT cbt_job_roles_pool_chk CHECK (pool IN ('hiring','staff'));
ALTER TABLE public.cbt_job_roles ALTER COLUMN retake_cooldown_days SET DEFAULT 0;
ALTER TABLE public.cbt_drives ADD COLUMN IF NOT EXISTS is_try_run boolean NOT NULL DEFAULT false;

-- Readiness that counts exactly the way cbt-start-attempt picks.
CREATE OR REPLACE FUNCTION public.cbt_blueprint_readiness(p_pool text, p_role_code text, p_sections jsonb, p_is_sandbox boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE s jsonb; out jsonb := '[]'::jsonb; st text[]; typ text; tags text[]; need int; have int; src text; gen boolean; note text;
BEGIN
  IF NOT public.cbt_can_view() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  st := CASE WHEN p_is_sandbox THEN ARRAY['approved','needs_review','draft'] ELSE ARRAY['approved'] END;
  FOR s IN SELECT value FROM jsonb_array_elements(COALESCE(p_sections,'[]'::jsonb)) LOOP
    typ := s->>'section_type';
    tags := ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(COALESCE(s->'category_tags','[]'::jsonb)) x WHERE btrim(x) <> '');
    src := COALESCE(NULLIF(s->>'item_source',''), 'bank');
    need := CASE WHEN typ = 'typing' THEN 1 ELSE GREATEST(COALESCE(NULLIF(s->>'item_count','')::int, 1), 1) END;
    gen := typ IN ('mental_maths','memory_recall') OR (typ IN ('data_entry','match_pairs') AND src IN ('generated','both'));
    note := NULL;
    IF gen THEN
      have := need;
    ELSIF typ = 'objective' AND 'reading' = ANY(tags) THEN
      need := 1;
      SELECT count(*) INTO have FROM public.cbt_stimuli WHERE status::text = ANY(st);
      note := 'reading passage';
    ELSE
      SELECT count(*) INTO have FROM public.cbt_questions q
       WHERE q.status::text = ANY(st) AND q.current_version_id IS NOT NULL
         AND q.pool IN (COALESCE(p_pool,'hiring'), 'shared')
         AND (q.applicable_role_codes IS NULL OR p_role_code IS NULL OR p_role_code = ANY(q.applicable_role_codes))
         AND CASE typ
           WHEN 'typing' THEN q.type::text = 'typing_passage' AND (cardinality(tags) = 0 OR q.category_tag = ANY(tags))
           WHEN 'data_entry' THEN q.type::text = 'data_entry_record' AND (cardinality(tags) = 0 OR q.category_tag = ANY(tags))
           WHEN 'match_pairs' THEN q.type::text = 'match_pair' AND (cardinality(tags) = 0 OR q.category_tag = ANY(tags))
           WHEN 'written' THEN q.type::text = 'written' AND (cardinality(tags) = 0 OR q.category_tag = ANY(tags))
           WHEN 'objective' THEN q.type::text IN ('mcq','numeric','sjt') AND (cardinality(tags) = 0 OR q.category_tag = ANY(tags))
           ELSE q.type::text = 'mcq' AND q.category_tag = ANY(CASE WHEN cardinality(tags) = 0 THEN ARRAY[typ] ELSE tags END)
         END;
    END IF;
    out := out || jsonb_build_object('order_index', s->'order_index', 'title', COALESCE(s->>'title', s->>'section_code'),
      'need', need, 'have', have, 'ready', have >= need, 'generated', gen, 'note', note);
  END LOOP;
  RETURN out;
END $f$;

CREATE OR REPLACE FUNCTION public.cbt_drive_readiness(p_job_role_ids uuid[], p_is_sandbox boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r record; x jsonb; problems jsonb := '[]'::jsonb; secs jsonb;
BEGIN
  IF NOT public.cbt_can_view() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF COALESCE(array_length(p_job_role_ids,1),0) = 0 THEN RETURN jsonb_build_array('Add at least one test to this drive.'); END IF;
  FOR r IN SELECT * FROM public.cbt_job_roles WHERE id = ANY(p_job_role_ids) LOOP
    IF NOT r.is_active THEN problems := problems || to_jsonb(format('%s: this test is not active.', r.name)); END IF;
    SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.order_index) INTO secs FROM public.cbt_role_sections rs WHERE rs.job_role_id = r.id;
    IF secs IS NULL THEN problems := problems || to_jsonb(format('%s: this test has no sections.', r.name)); CONTINUE; END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(public.cbt_blueprint_readiness(r.pool, r.code, secs, p_is_sandbox)) LOOP
      IF NOT (x->>'ready')::boolean THEN
        IF x->>'note' = 'reading passage' THEN
          problems := problems || to_jsonb(format('%s · %s: no reading passage is available.', r.name, x->>'title'));
        ELSE
          problems := problems || to_jsonb(format('%s · %s: needs %s %s question(s), %s available.', r.name, x->>'title', x->>'need',
            CASE WHEN p_is_sandbox THEN 'usable' ELSE 'approved' END, x->>'have'));
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN problems;
END $f$;

DROP FUNCTION IF EXISTS public.cbt_save_role_blueprint(uuid, uuid, text, numeric, numeric, boolean, jsonb);
CREATE FUNCTION public.cbt_save_role_blueprint(p_role_id uuid DEFAULT NULL, p_position_id uuid DEFAULT NULL, p_code text DEFAULT NULL,
  p_shortlist_cutoff numeric DEFAULT 65, p_hold_cutoff numeric DEFAULT 50, p_is_active boolean DEFAULT true, p_sections jsonb DEFAULT '[]'::jsonb,
  p_retake_cooldown_days integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_role_id uuid; v_position_id uuid;
  v_code text := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '_', 'g'));
  v_sections jsonb := coalesce(p_sections, '[]'::jsonb);
  v_section jsonb; v_index int; v_section_code text; v_section_type public.cbt_section_type; v_title text; v_tags text[];
  v_item_count int; v_duration_seconds int; v_weight numeric; v_negative_mark numeric; v_skill_level text; v_source text;
  v_before jsonb; v_total_weight numeric := 0;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  IF coalesce(p_shortlist_cutoff, -1) < 0 OR p_shortlist_cutoff > 100 OR coalesce(p_hold_cutoff, -1) < 0 OR p_hold_cutoff > 100 THEN
    RAISE EXCEPTION 'Shortlist and hold cut-offs must be between 0 and 100';
  END IF;
  IF p_hold_cutoff > p_shortlist_cutoff THEN RAISE EXCEPTION 'Hold cut-off cannot exceed shortlist cut-off'; END IF;
  IF coalesce(p_retake_cooldown_days, 0) < 0 OR p_retake_cooldown_days > 365 THEN RAISE EXCEPTION 'Retake wait must be 0–365 days'; END IF;
  IF jsonb_typeof(v_sections) <> 'array' THEN RAISE EXCEPTION 'Blueprint sections must be an array'; END IF;
  IF jsonb_array_length(v_sections) = 0 THEN RAISE EXCEPTION 'Add at least one section'; END IF;
  IF (SELECT count(DISTINCT upper(value->>'section_code')) FROM jsonb_array_elements(v_sections)) <> jsonb_array_length(v_sections) THEN
    RAISE EXCEPTION 'Two sections share the same code';
  END IF;

  IF p_role_id IS NULL THEN
    IF p_position_id IS NULL THEN RAISE EXCEPTION 'Select a company position'; END IF;
    IF v_code = '' THEN
      SELECT upper(regexp_replace(btrim(d.code || '_' || po.title), '[^A-Za-z0-9]+', '_', 'g')) INTO v_code
        FROM public.positions po JOIN public.departments d ON d.id = po.department_id
       WHERE po.id = p_position_id AND po.is_active = true;
    END IF;
    IF v_code IS NULL OR v_code = '' THEN RAISE EXCEPTION 'A valid role code is required'; END IF;
    INSERT INTO public.cbt_job_roles (position_id, code, name, department_code, shortlist_cutoff, hold_cutoff, is_active, retake_cooldown_days)
    VALUES (p_position_id, v_code, '', '', p_shortlist_cutoff, p_hold_cutoff, coalesce(p_is_active, true), coalesce(p_retake_cooldown_days, 0))
    RETURNING id INTO v_role_id;
  ELSE
    SELECT position_id INTO v_position_id FROM public.cbt_job_roles WHERE id = p_role_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quiz role not found'; END IF;
    IF p_position_id IS NOT NULL AND p_position_id <> v_position_id THEN RAISE EXCEPTION 'The linked company position cannot be changed'; END IF;
    IF v_code = '' THEN RAISE EXCEPTION 'A valid role code is required'; END IF;
    SELECT jsonb_build_object('role', to_jsonb(j), 'sections', (SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.order_index) FROM public.cbt_role_sections rs WHERE rs.job_role_id = j.id))
      INTO v_before FROM public.cbt_job_roles j WHERE j.id = p_role_id;
    UPDATE public.cbt_job_roles SET code = v_code, shortlist_cutoff = p_shortlist_cutoff, hold_cutoff = p_hold_cutoff,
           is_active = coalesce(p_is_active, true), retake_cooldown_days = coalesce(p_retake_cooldown_days, 0)
     WHERE id = p_role_id;
    v_role_id := p_role_id;
    -- Running attempts keep their frozen blueprint_snapshot, so replacing sections is safe.
    DELETE FROM public.cbt_role_sections WHERE job_role_id = v_role_id;
  END IF;

  FOR v_section IN SELECT value FROM jsonb_array_elements(v_sections) LOOP
    v_index := nullif(v_section->>'order_index', '')::int;
    v_section_code := upper(regexp_replace(btrim(coalesce(v_section->>'section_code', '')), '[^A-Za-z0-9]+', '_', 'g'));
    v_section_type := nullif(v_section->>'section_type', '')::public.cbt_section_type;
    v_title := nullif(btrim(v_section->>'title'), '');
    v_tags := ARRAY(SELECT btrim(value) FROM jsonb_array_elements_text(coalesce(v_section->'category_tags', '[]'::jsonb)) WHERE btrim(value) <> '');
    v_item_count := coalesce(nullif(v_section->>'item_count', '')::int, 1);
    v_duration_seconds := nullif(v_section->>'duration_seconds', '')::int;
    v_weight := coalesce(nullif(v_section->>'weight', '')::numeric, 0);
    v_negative_mark := coalesce(nullif(v_section->>'negative_mark', '')::numeric, 0);
    v_skill_level := lower(nullif(btrim(coalesce(v_section->>'skill_level', '')), ''));
    v_source := lower(coalesce(nullif(btrim(v_section->>'item_source'), ''), 'bank'));

    IF v_index IS NULL OR v_index < 1 OR v_section_code = '' OR v_section_type IS NULL OR v_title IS NULL THEN
      RAISE EXCEPTION 'Every section needs an order, code, type, and title';
    END IF;
    IF v_item_count < 1 OR v_item_count > 100 OR coalesce(v_duration_seconds, 0) < 30 OR v_duration_seconds > 7200 THEN
      RAISE EXCEPTION '%: needs 1–100 items and 30 seconds to 2 hours', v_title;
    END IF;
    IF v_weight < 0 OR v_weight > 100 OR v_negative_mark < 0 OR v_negative_mark > 100 THEN
      RAISE EXCEPTION '%: weight must be 0–100 and negative marks cannot be below zero', v_title;
    END IF;
    IF v_skill_level IS NOT NULL AND v_skill_level NOT IN ('beginner','intermediate','advanced') THEN
      RAISE EXCEPTION 'Skill level must be beginner, intermediate, or advanced';
    END IF;
    IF v_source NOT IN ('bank','generated','both') THEN RAISE EXCEPTION 'Item source must be generated, bank or both'; END IF;
    IF v_source <> 'bank' AND v_section_type::text NOT IN ('data_entry','match_pairs') THEN
      RAISE EXCEPTION '%: only data entry and match pairs can use generated items', v_title;
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_tags) t WHERE NOT EXISTS (SELECT 1 FROM public.cbt_subjects sj WHERE sj.key = t)) THEN
      RAISE EXCEPTION '%: unknown subject', v_title;
    END IF;
    v_total_weight := v_total_weight + v_weight;

    INSERT INTO public.cbt_role_sections (job_role_id, order_index, section_code, section_type, title, category_tags,
      item_count, duration_seconds, weight, negative_mark, gate_min_score, gate_min_net_wpm, gate_min_accuracy, full_marks_wpm,
      practice_seconds, min_words, max_words, skill_level, item_source)
    VALUES (v_role_id, v_index, v_section_code, v_section_type, v_title, v_tags, v_item_count, v_duration_seconds, v_weight, v_negative_mark,
      nullif(v_section->>'gate_min_score', '')::numeric, nullif(v_section->>'gate_min_net_wpm', '')::numeric,
      nullif(v_section->>'gate_min_accuracy', '')::numeric, nullif(v_section->>'full_marks_wpm', '')::numeric,
      coalesce(nullif(v_section->>'practice_seconds', '')::int, 0), nullif(v_section->>'min_words', '')::int,
      nullif(v_section->>'max_words', '')::int, v_skill_level, v_source);
  END LOOP;
  IF v_total_weight <= 0 THEN RAISE EXCEPTION 'At least one section needs a weight above 0'; END IF;

  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), 'cbt_job_roles', v_role_id, CASE WHEN p_role_id IS NULL THEN 'created' ELSE 'blueprint_updated' END, v_before,
    jsonb_build_object('code', v_code, 'shortlist_cutoff', p_shortlist_cutoff, 'hold_cutoff', p_hold_cutoff, 'is_active', p_is_active,
      'retake_cooldown_days', p_retake_cooldown_days, 'sections', v_sections));
  RETURN v_role_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'That role code, position, or section order is already in use';
END $function$;
GRANT EXECUTE ON FUNCTION public.cbt_save_role_blueprint(uuid, uuid, text, numeric, numeric, boolean, jsonb, integer) TO authenticated;

-- Scoring: data entry and match pairs also score generated items (key in generated_key).
CREATE OR REPLACE FUNCTION public.cbt_score_section(p_section_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  s public.cbt_attempt_sections; cfg jsonb; duration numeric; neg numeric; norm numeric; raw numeric := 0; maxs numeric := 0;
  gate boolean; met jsonb; passage text; pwords text[]; cwords text[];
  i int; correct_words int := 0; correct_chars int := 0; total_chars int := 0;
  elapsed numeric; minutes numeric; net numeric; gross numeric; acc numeric;
  rec record; earned numeric := 0; possible numeric := 0; fields jsonb; keyrec jsonb; w numeric; okf boolean; fname text;
  n_correct int := 0; n_wrong int := 0; n_total int := 0; redflag boolean := false;
  wr_total numeric := 0; wr_count int := 0; wr_pending boolean := false;
BEGIN
  SELECT * INTO s FROM public.cbt_attempt_sections WHERE id = p_section_id;
  IF s.id IS NULL THEN RETURN; END IF;
  IF s.section_type IN ('mental_maths', 'memory_recall') THEN PERFORM public.cbt_score_skill_section(p_section_id); RETURN; END IF;

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
        correct_words := correct_words + 1; correct_chars := correct_chars + length(cwords[i]) + 1;
      END IF;
    END LOOP;
    elapsed := COALESCE((met->>'elapsed_seconds')::numeric, duration);
    IF COALESCE(array_length(cwords,1),0) >= COALESCE(array_length(pwords,1),0) AND COALESCE(array_length(pwords,1),0) > 0 THEN
      minutes := GREATEST(elapsed, 1) / 60.0;
    ELSE minutes := duration / 60.0; END IF;
    IF COALESCE(array_length(cwords,1),0) = 0 THEN net := 0; gross := 0; acc := 0;
    ELSE
      net := round(((correct_chars / 5.0) / minutes)::numeric, 1);
      gross := round(((total_chars / 5.0) / minutes)::numeric, 1);
      acc := round((correct_words::numeric / array_length(cwords,1) * 100)::numeric, 1);
    END IF;
    norm := LEAST(100, round((net / NULLIF(COALESCE((cfg->>'full_marks_wpm')::numeric, 50),0) * 100)::numeric, 1));
    raw := net; maxs := COALESCE((cfg->>'full_marks_wpm')::numeric, 50);
    IF cfg->>'gate_min_net_wpm' IS NOT NULL OR cfg->>'gate_min_accuracy' IS NOT NULL THEN
      gate := net >= COALESCE((cfg->>'gate_min_net_wpm')::numeric, 0) AND acc >= COALESCE((cfg->>'gate_min_accuracy')::numeric, 0);
    END IF;
    met := met || jsonb_build_object('net_wpm', net, 'gross_wpm', gross, 'accuracy', acc,
             'words_committed', COALESCE(array_length(cwords,1),0), 'correct_words', correct_words, 'passage_words', COALESCE(array_length(pwords,1),0));

  ELSIF s.section_type = 'data_entry' THEN
    FOR rec IN
      SELECT ai.id, ai.response, COALESCE(qv.content->'record', ai.generated_key->'record') AS key_record
        FROM public.cbt_attempt_items ai LEFT JOIN public.cbt_question_versions qv ON qv.id = ai.question_version_id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      keyrec := COALESCE(rec.key_record, '{}'::jsonb);
      fields := COALESCE(rec.response->'fields', '{}'::jsonb);
      FOREACH fname IN ARRAY ARRAY['name','pan','account_number','ifsc','utr','amount','txn_date'] LOOP
        w := CASE WHEN fname IN ('name','txn_date') THEN 1 ELSE 2 END;
        possible := possible + w; okf := false;
        IF fname IN ('name','pan','ifsc') THEN
          okf := lower(public.cbt_norm_text(fields->>fname)) = lower(public.cbt_norm_text(keyrec->>fname)) AND public.cbt_norm_text(keyrec->>fname) <> '';
        ELSIF fname IN ('account_number','utr') THEN
          okf := public.cbt_norm_text(fields->>fname) = public.cbt_norm_text(keyrec->>fname) AND public.cbt_norm_text(keyrec->>fname) <> '';
        ELSIF fname = 'amount' THEN
          okf := public.cbt_norm_amount(fields->>fname) IS NOT NULL AND public.cbt_norm_amount(fields->>fname) = public.cbt_norm_amount(keyrec->>fname);
        ELSE
          okf := public.cbt_norm_text(fields->>fname) = public.cbt_norm_text(keyrec->>fname) AND public.cbt_norm_text(keyrec->>fname) ~ '^\d{2}/\d{2}/\d{4}$';
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
      SELECT ai.id, ai.response, COALESCE(k.pair_is_match, (ai.generated_key->>'match')::boolean) AS pair_is_match
        FROM public.cbt_attempt_items ai LEFT JOIN public.cbt_question_keys k ON k.question_version_id = ai.question_version_id
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
    norm := CASE WHEN n_total = 0 THEN 0 ELSE GREATEST(0, round((n_correct::numeric / n_total * 100 - neg * n_wrong)::numeric, 1)) END;
    met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'total', n_total);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;

  ELSIF s.section_type IN ('objective','logical_reasoning','problem_solving','pattern_recognition','grammar','vocabulary') THEN
    FOR rec IN
      SELECT ai.id, ai.response, q.type, k.correct_option_id, k.numeric_answer, k.numeric_tolerance, k.sjt_scores, k.red_flag_option_ids
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
          IF answered AND public.cbt_norm_amount(rec.response->>'value') IS NOT NULL AND rec.numeric_answer IS NOT NULL
             AND abs(public.cbt_norm_amount(rec.response->>'value') - rec.numeric_answer) <= COALESCE(rec.numeric_tolerance,0) THEN m := 1; END IF;
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
        UPDATE public.cbt_attempt_items SET marks_awarded = m, is_correct = (m > 0), is_red_flag = flag WHERE id = rec.id;
      END;
    END LOOP;
    norm := CASE WHEN maxs = 0 THEN 0 ELSE GREATEST(0, round((raw / maxs * 100 - neg * n_wrong)::numeric, 1)) END;
    met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'total', n_total, 'red_flag', redflag);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;

  ELSIF s.section_type = 'written' THEN
    INSERT INTO public.cbt_written_evaluations (attempt_item_id)
    SELECT ai.id FROM public.cbt_attempt_items ai WHERE ai.attempt_section_id = s.id
    ON CONFLICT (attempt_item_id) DO NOTHING;
    FOR rec IN
      SELECT ai.id, e.total FROM public.cbt_attempt_items ai
        LEFT JOIN public.cbt_written_evaluations e ON e.attempt_item_id = ai.id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1;
      IF rec.total IS NULL THEN wr_pending := true;
      ELSE
        wr_total := wr_total + round((rec.total / 20.0 * 100)::numeric, 1); wr_count := wr_count + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = rec.total WHERE id = rec.id;
      END IF;
    END LOOP;
    maxs := n_total * 100; raw := wr_total;
    norm := CASE WHEN wr_count = 0 THEN 0 ELSE round((wr_total / wr_count)::numeric, 1) END;
    met := met || jsonb_build_object('graded_items', wr_count, 'total_items', n_total, 'pending_grading', wr_pending);
    IF cfg->>'gate_min_score' IS NOT NULL AND NOT wr_pending THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;
  END IF;

  UPDATE public.cbt_attempt_sections SET raw_score = raw, max_score = maxs, normalized_score = norm, gate_passed = gate, metrics = met
   WHERE id = p_section_id;
END $function$;

-- "Try it as a candidate": a private sandbox drive for one test.
CREATE OR REPLACE FUNCTION public.cbt_try_test(p_role_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r public.cbt_job_roles; secs jsonb; missing text; code text; d public.cbt_drives;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  SELECT * INTO r FROM public.cbt_job_roles WHERE id = p_role_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Test not found'; END IF;
  SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.order_index) INTO secs FROM public.cbt_role_sections rs WHERE rs.job_role_id = r.id;
  IF secs IS NULL THEN RAISE EXCEPTION 'This test has no sections yet.'; END IF;
  SELECT string_agg(x->>'title', ', ') INTO missing FROM jsonb_array_elements(public.cbt_blueprint_readiness(r.pool, r.code, secs, true)) x
   WHERE NOT (x->>'ready')::boolean;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Not enough questions for: %', missing; END IF;
  code := public.cbt_new_access_code();
  INSERT INTO public.cbt_drives (name, access_code, mode, starts_at, ends_at, job_role_ids, is_sandbox, is_try_run, status, created_by)
  VALUES ('Try run · ' || r.name, code, 'on_site', now() - interval '1 minute', now() + interval '6 hours', ARRAY[r.id], true, true, 'live', auth.uid())
  RETURNING * INTO d;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
  VALUES (auth.uid(), 'cbt_drives', d.id, 'try_run_created', jsonb_build_object('job_role_id', r.id, 'access_code', code));
  RETURN jsonb_build_object('drive_id', d.id, 'access_code', code);
END $f$;
GRANT EXECUTE ON FUNCTION public.cbt_try_test(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cbt_try_runs(p_role_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'public_ref', a.public_ref, 'person', c.full_name, 'status', a.status,
      'total_score', a.total_score, 'decision', a.decision, 'created_at', a.created_at, 'access_code', d.access_code,
      'removed_after', d.created_at + interval '3 days') ORDER BY a.created_at DESC)
    FROM public.cbt_attempts a JOIN public.cbt_drives d ON d.id = a.drive_id AND d.is_try_run
    LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id
    WHERE a.job_role_id = p_role_id), '[]'::jsonb) END
$f$;
GRANT EXECUTE ON FUNCTION public.cbt_try_runs(uuid) TO authenticated;

-- Try runs clean themselves up 3 days after creation.
CREATE OR REPLACE FUNCTION public.cbt_purge_try_runs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE drives uuid[]; cands uuid[]; n int;
BEGIN
  SELECT array_agg(id) INTO drives FROM public.cbt_drives WHERE is_try_run AND created_at < now() - interval '3 days';
  IF drives IS NULL THEN RETURN 0; END IF;
  SELECT array_agg(DISTINCT candidate_id) INTO cands FROM public.cbt_attempts WHERE drive_id = ANY(drives);
  DELETE FROM public.cbt_attempts WHERE drive_id = ANY(drives);
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.cbt_candidates c WHERE c.id = ANY(COALESCE(cands, '{}'::uuid[]))
     AND NOT EXISTS (SELECT 1 FROM public.cbt_attempts a WHERE a.candidate_id = c.id);
  DELETE FROM public.cbt_drives WHERE id = ANY(drives);
  INSERT INTO public.cbt_audit_log (entity, action, reason, after)
  VALUES ('cbt_drives', 'try_run_purge', format('Removed %s try-run drive(s) and %s attempt(s)', cardinality(drives), n), jsonb_build_object('drives', drives));
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.cbt_purge_try_runs() FROM PUBLIC, anon, authenticated;

-- Try runs never count: hidden from drives, overview and question analytics.
CREATE OR REPLACE FUNCTION public.cbt_drives_list()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) END
  FROM (
    SELECT to_jsonb(d) || jsonb_build_object(
      'tests', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'code', j.code) ORDER BY j.name), '[]'::jsonb) FROM public.cbt_job_roles j WHERE j.id = ANY(d.job_role_ids)),
      'registered', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id),
      'testing', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id AND a.status = 'in_progress'),
      'submitted', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id AND a.status IN ('submitted','auto_submitted'))
    ) AS row
    FROM public.cbt_drives d WHERE NOT d.is_try_run
  ) t
$function$;

CREATE OR REPLACE FUNCTION public.cbt_overview()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH real AS (SELECT a.* FROM public.cbt_attempts a JOIN public.cbt_drives d ON d.id = a.drive_id WHERE NOT d.is_try_run)
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE jsonb_build_object(
    'live_drives', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'code', d.access_code, 'ends_at', d.ends_at, 'is_sandbox', d.is_sandbox,
        'testing', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id AND a.status = 'in_progress')) ORDER BY d.ends_at), '[]'::jsonb)
      FROM public.cbt_drives d WHERE d.status = 'live' AND NOT d.is_try_run),
    'testing_now', (SELECT count(*) FROM real WHERE status = 'in_progress'),
    'submitted_today', (SELECT count(*) FROM real WHERE NOT is_sandbox AND status IN ('submitted','auto_submitted')
        AND (submitted_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'awaiting_grading', (SELECT count(*) FROM public.cbt_written_evaluations e JOIN public.cbt_attempt_items i ON i.id = e.attempt_item_id
        JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id JOIN real a ON a.id = s.attempt_id WHERE e.total IS NULL),
    'week', (SELECT jsonb_build_object('shortlisted', count(*) FILTER (WHERE decision = 'shortlisted'), 'hold', count(*) FILTER (WHERE decision = 'hold'),
        'rejected', count(*) FILTER (WHERE decision = 'rejected'))
      FROM real WHERE NOT is_sandbox AND submitted_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),
    'latest', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'submitted_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', a.id, 'public_ref', a.public_ref, 'person', c.full_name, 'test', j.name,
          'total_score', a.total_score, 'decision', a.decision, 'decision_source', a.decision_source, 'submitted_at', a.submitted_at, 'is_sandbox', a.is_sandbox) x
        FROM real a LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id LEFT JOIN public.cbt_job_roles j ON j.id = a.job_role_id
        WHERE a.submitted_at IS NOT NULL ORDER BY a.submitted_at DESC LIMIT 8) t)
  ) END
$function$;

CREATE OR REPLACE FUNCTION public.cbt_question_bank_analytics()
 RETURNS TABLE(question_id uuid, type text, category_tag text, subject_name text, pool text, difficulty text, status text, times_served integer, applicable_role_codes text[], created_at timestamp with time zone, version_no integer, version_count integer, current_served boolean, content jsonb, answer_key jsonb, prompt text, marks numeric, options jsonb, correct_option_id text, numeric_answer numeric, explanation text, served_items bigint, answered_items bigint, correct_items bigint, wrong_items bigint, skipped_items bigint, accuracy numeric, avg_marks numeric, last_served_at timestamp with time zone, option_tally jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH real_items AS (
    SELECT i.* FROM public.cbt_attempt_items i
      JOIN public.cbt_attempt_sections sec ON sec.id = i.attempt_section_id
      JOIN public.cbt_attempts a ON a.id = sec.attempt_id
      JOIN public.cbt_drives d ON d.id = a.drive_id
     WHERE NOT d.is_try_run AND i.question_version_id IS NOT NULL),
  item_stats AS (
    SELECT v.question_id, count(*) AS served_items,
           count(*) FILTER (WHERE i.response IS NOT NULL) AS answered_items,
           count(*) FILTER (WHERE i.is_correct IS TRUE) AS correct_items,
           count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL) AS wrong_items,
           count(*) FILTER (WHERE i.response IS NULL) AS skipped_items,
           avg(i.marks_awarded) AS avg_marks, max(coalesce(i.answered_at, i.created_at)) AS last_served_at
    FROM real_items i JOIN public.cbt_question_versions v ON v.id = i.question_version_id GROUP BY v.question_id),
  opt AS (
    SELECT v.question_id, i.response->>'option_id' AS option_id, count(*) AS picks
    FROM real_items i JOIN public.cbt_question_versions v ON v.id = i.question_version_id
    WHERE i.response ? 'option_id' GROUP BY v.question_id, i.response->>'option_id'),
  opt_agg AS (SELECT question_id, jsonb_object_agg(option_id, picks) AS option_tally FROM opt GROUP BY question_id)
  SELECT q.id, q.type::text, q.category_tag, sj.display_name, q.pool, q.difficulty::text, q.status::text, q.times_served, q.applicable_role_codes, q.created_at,
         v.version_no, (SELECT count(*)::int FROM public.cbt_question_versions x WHERE x.question_id = q.id), v.first_served_at IS NOT NULL,
         v.content,
         jsonb_strip_nulls(jsonb_build_object('correct_option_id', k.correct_option_id, 'numeric_answer', k.numeric_answer, 'numeric_tolerance', k.numeric_tolerance,
           'pair_is_match', k.pair_is_match, 'rubric', k.rubric, 'explanation', k.explanation)),
         COALESCE(v.content->>'prompt', v.content->>'passage', v.content->>'left', v.content->'record'->>'name'),
         nullif(v.content->>'marks','')::numeric, v.content->'options', k.correct_option_id, k.numeric_answer, k.explanation,
         coalesce(s.served_items,0), coalesce(s.answered_items,0), coalesce(s.correct_items,0), coalesce(s.wrong_items,0), coalesce(s.skipped_items,0),
         CASE WHEN coalesce(s.answered_items,0) > 0 THEN round(100.0 * s.correct_items / s.answered_items, 1) END,
         round(coalesce(s.avg_marks,0),2), s.last_served_at, coalesce(o.option_tally,'{}'::jsonb)
  FROM public.cbt_questions q
  LEFT JOIN public.cbt_question_versions v ON v.id = q.current_version_id
  LEFT JOIN public.cbt_question_keys k ON k.question_version_id = q.current_version_id
  LEFT JOIN public.cbt_subjects sj ON sj.key = q.category_tag
  LEFT JOIN item_stats s ON s.question_id = q.id
  LEFT JOIN opt_agg o ON o.question_id = q.id
  WHERE public.cbt_can_view()
$function$;

GRANT EXECUTE ON FUNCTION public.cbt_blueprint_readiness(text, text, jsonb, boolean) TO authenticated;

SELECT cron.schedule('quiz-try-run-cleanup', '20 * * * *', 'SELECT public.cbt_purge_try_runs();');
