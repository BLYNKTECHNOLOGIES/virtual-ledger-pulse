CREATE OR REPLACE FUNCTION public.cbt_score_skill_section(p_section_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cbt_attempt_sections;
  cfg jsonb;
  neg numeric;
  met jsonb;
  rec record;
  n_total int := 0; n_correct int := 0; n_wrong int := 0;
  earned numeric := 0; possible numeric := 0;
  norm numeric := 0;
  gate boolean;
  seq text[]; ansq text[]; i int;
  given numeric; want numeric;
BEGIN
  SELECT * INTO s FROM public.cbt_attempt_sections WHERE id = p_section_id;
  IF s.id IS NULL THEN RETURN; END IF;
  cfg := public.cbt_section_config(p_section_id);
  neg := COALESCE((cfg->>'negative_mark')::numeric, 0);
  met := COALESCE(s.metrics, '{}'::jsonb);

  IF s.section_type = 'mental_maths' THEN
    FOR rec IN
      SELECT ai.id, ai.response, ai.generated_key
        FROM public.cbt_attempt_items ai
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1;
      given := public.cbt_norm_amount(rec.response->>'value');
      want := NULLIF(rec.generated_key->>'answer', '')::numeric;
      IF given IS NOT NULL AND want IS NOT NULL AND given = want THEN
        n_correct := n_correct + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 1, is_correct = true WHERE id = rec.id;
      ELSE
        IF given IS NOT NULL THEN n_wrong := n_wrong + 1; END IF;
        UPDATE public.cbt_attempt_items SET marks_awarded = 0, is_correct = false WHERE id = rec.id;
      END IF;
    END LOOP;
    norm := CASE WHEN n_total = 0 THEN 0
      ELSE GREATEST(0, round((n_correct::numeric / n_total * 100 - neg * n_wrong)::numeric, 1)) END;
    met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'total', n_total,
             'attempted', n_correct + n_wrong);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;
    UPDATE public.cbt_attempt_sections
       SET raw_score = n_correct, max_score = n_total, normalized_score = norm, gate_passed = gate, metrics = met
     WHERE id = p_section_id;

  ELSIF s.section_type = 'memory_recall' THEN
    FOR rec IN
      SELECT ai.id, ai.response, ai.generated_key
        FROM public.cbt_attempt_items ai
       WHERE ai.attempt_section_id = s.id ORDER BY ai.display_order
    LOOP
      n_total := n_total + 1;
      SELECT COALESCE(array_agg(x ORDER BY ord), '{}'::text[]) INTO seq
        FROM jsonb_array_elements_text(COALESCE(rec.generated_key->'sequence', '[]'::jsonb)) WITH ORDINALITY t(x, ord);
      ansq := regexp_split_to_array(
                trim(regexp_replace(COALESCE(rec.response->>'value', ''), '[^0-9A-Za-z]+', ' ', 'g')), '\s+');
      IF ansq IS NULL THEN ansq := '{}'::text[]; END IF;
      possible := possible + COALESCE(array_length(seq, 1), 0);
      FOR i IN 1..COALESCE(array_length(seq, 1), 0) LOOP
        IF i <= COALESCE(array_length(ansq, 1), 0)
           AND lower(ansq[i]) = lower(seq[i]) THEN
          earned := earned + 1;
        END IF;
      END LOOP;
      IF COALESCE(array_length(seq,1),0) > 0
         AND COALESCE(array_length(ansq,1),0) = COALESCE(array_length(seq,1),0)
         AND lower(array_to_string(ansq, ' ')) = lower(array_to_string(seq, ' ')) THEN
        n_correct := n_correct + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 1, is_correct = true WHERE id = rec.id;
      ELSE
        IF COALESCE(array_length(ansq,1),0) > 0 THEN n_wrong := n_wrong + 1; END IF;
        UPDATE public.cbt_attempt_items SET marks_awarded = 0, is_correct = false WHERE id = rec.id;
      END IF;
    END LOOP;
    norm := CASE WHEN possible = 0 THEN 0 ELSE round((earned / possible * 100)::numeric, 1) END;
    met := met || jsonb_build_object('correct_sequences', n_correct, 'wrong_sequences', n_wrong,
             'total_sequences', n_total, 'correct_items', earned, 'possible_items', possible);
    IF cfg->>'gate_min_score' IS NOT NULL THEN gate := norm >= (cfg->>'gate_min_score')::numeric; END IF;
    UPDATE public.cbt_attempt_sections
       SET raw_score = earned, max_score = possible, normalized_score = norm, gate_passed = gate, metrics = met
     WHERE id = p_section_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.cbt_score_skill_section(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cbt_score_skill_section(uuid) TO service_role;