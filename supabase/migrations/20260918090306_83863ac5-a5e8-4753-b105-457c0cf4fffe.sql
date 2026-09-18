CREATE OR REPLACE FUNCTION public.cbt_score_section(p_section_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_attempt_sections;
  cfg jsonb;
  rec record;
  raw numeric := 0;
  maxs numeric := 0;
  norm numeric := 0;
  met jsonb := '{}'::jsonb;
  gate boolean := true;
  n_total int := 0;
  n_correct int := 0;
  n_wrong int := 0;
  m numeric;
  answered boolean;
  flag boolean;
  neg numeric := 0;
  wr_pending boolean := false;
  wr_total numeric := 0;
  wr_count int := 0;
BEGIN
  SELECT * INTO s FROM public.cbt_attempt_sections WHERE id = p_section_id;
  IF s.id IS NULL THEN RETURN; END IF;
  cfg := public.cbt_section_config(s.id);
  neg := COALESCE((cfg->>'negative_mark')::numeric, 0);

  IF s.section_type = 'objective' THEN
    FOR rec IN
      SELECT ai.id, ai.response, q.type, k.correct_option_id, k.numeric_answer,
             k.numeric_tolerance, k.sjt_scores, k.red_flag_option_ids
        FROM public.cbt_attempt_items ai
        JOIN public.cbt_question_versions v ON v.id = ai.question_version_id
        JOIN public.cbt_questions q ON q.id = v.question_id
        LEFT JOIN public.cbt_question_keys k ON k.question_version_id = v.id
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1;
      answered := rec.response IS NOT NULL AND rec.response <> '{}'::jsonb;
      m := 0;
      flag := false;
      IF rec.type = 'mcq' THEN
        m := CASE WHEN answered AND rec.response->>'option_id' = rec.correct_option_id THEN 1 ELSE 0 END;
      ELSIF rec.type = 'numeric' THEN
        IF answered AND rec.numeric_answer IS NOT NULL THEN
          m := CASE WHEN abs((rec.response->>'value')::numeric - rec.numeric_answer) <= COALESCE(rec.numeric_tolerance,0) THEN 1 ELSE 0 END;
        END IF;
      ELSIF rec.type = 'sjt' THEN
        IF answered THEN
          m := COALESCE((rec.sjt_scores->>(rec.response->>'option_id'))::numeric,0);
          flag := COALESCE(rec.red_flag_option_ids,'{}') @> ARRAY[rec.response->>'option_id'];
        END IF;
      END IF;
      raw := raw + m;
      IF answered AND m = 0 THEN n_wrong := n_wrong + 1; END IF;
      IF m > 0 THEN n_correct := n_correct + 1; END IF;
      IF flag THEN met := met || jsonb_build_object('red_flag', true); END IF;
      UPDATE public.cbt_attempt_items SET marks_awarded=m, is_correct=(m>0), is_red_flag=flag WHERE id=rec.id;
    END LOOP;
    maxs := n_total;
    norm := CASE WHEN maxs=0 THEN 0 ELSE GREATEST(0, round((raw/maxs*100-neg*n_wrong)::numeric,1)) END;
    met := met || jsonb_build_object('correct',n_correct,'wrong',n_wrong,'total',n_total);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;
  ELSIF s.section_type = 'written' THEN
    INSERT INTO public.cbt_written_evaluations (attempt_item_id)
    SELECT ai.id
      FROM public.cbt_attempt_items ai
     WHERE ai.attempt_section_id = s.id
       AND ai.response IS NOT NULL
       AND NULLIF(btrim(ai.response->>'text'), '') IS NOT NULL
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
  ELSE
    RETURN;
  END IF;

  UPDATE public.cbt_attempt_sections
     SET raw_score=raw, max_score=maxs, normalized_score=norm, gate_passed=gate, metrics=met
   WHERE id=p_section_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cbt_grade_written_response(
  p_evaluation_id uuid,
  p_total numeric,
  p_comments text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_section_id uuid;
  v_attempt_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cbt_can_evaluate(auth.uid()) THEN
    RAISE EXCEPTION 'Quiz evaluation permission required';
  END IF;
  IF p_total IS NULL OR p_total < 0 OR p_total > 20 THEN
    RAISE EXCEPTION 'Written score must be between 0 and 20';
  END IF;

  SELECT e.attempt_item_id, i.attempt_section_id, s.attempt_id
    INTO v_item_id, v_section_id, v_attempt_id
    FROM public.cbt_written_evaluations e
    JOIN public.cbt_attempt_items i ON i.id=e.attempt_item_id
    JOIN public.cbt_attempt_sections s ON s.id=i.attempt_section_id
   WHERE e.id=p_evaluation_id
   FOR UPDATE OF e;
  IF v_item_id IS NULL THEN RAISE EXCEPTION 'Written response not found'; END IF;

  UPDATE public.cbt_written_evaluations
     SET evaluator_id=auth.uid(), total=p_total,
         comments=NULLIF(btrim(COALESCE(p_comments,'')),''), updated_at=now()
   WHERE id=p_evaluation_id;

  PERFORM public.cbt_score_section(v_section_id);
  PERFORM public.cbt_finalize_attempt(v_attempt_id);
  INSERT INTO public.cbt_audit_log(actor_id,entity,entity_id,action,reason)
  VALUES(auth.uid(),'cbt_written_evaluations',p_evaluation_id,'grade_written_response','Written response graded');
END;
$$;
REVOKE ALL ON FUNCTION public.cbt_grade_written_response(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_grade_written_response(uuid,numeric,text) TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.cbt_attempt_sections
     WHERE section_type='written' AND status IN ('submitted','auto_submitted')
  LOOP
    PERFORM public.cbt_score_section(r.id);
    PERFORM public.cbt_finalize_attempt((SELECT attempt_id FROM public.cbt_attempt_sections WHERE id=r.id));
  END LOOP;
END $$;