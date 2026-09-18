CREATE OR REPLACE FUNCTION public.cbt_create_question(
  p_type public.cbt_question_type,
  p_category_tag text,
  p_difficulty public.cbt_difficulty,
  p_prompt text,
  p_marks numeric DEFAULT 1,
  p_options jsonb DEFAULT NULL,
  p_correct_option_id text DEFAULT NULL,
  p_numeric_answer numeric DEFAULT NULL,
  p_numeric_tolerance numeric DEFAULT 0,
  p_rubric jsonb DEFAULT NULL,
  p_role_codes text[] DEFAULT NULL,
  p_explanation text DEFAULT NULL,
  p_approve boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q uuid;
  v_v uuid;
  v_tag text := nullif(btrim(p_category_tag), '');
  v_prompt text := nullif(btrim(p_prompt), '');
  v_opt_count int := 0;
BEGIN
  IF NOT public.cbt_can_manage() THEN
    RAISE EXCEPTION 'Quiz management permission required';
  END IF;
  IF v_tag IS NULL THEN
    RAISE EXCEPTION 'Category tag is required';
  END IF;
  IF v_prompt IS NULL THEN
    RAISE EXCEPTION 'Question text is required';
  END IF;
  IF p_type NOT IN ('mcq','numeric','written') THEN
    RAISE EXCEPTION 'Unsupported question type %', p_type;
  END IF;
  IF COALESCE(p_marks, 0) <= 0 THEN
    RAISE EXCEPTION 'Marks must be greater than zero';
  END IF;

  IF p_type = 'mcq' THEN
    SELECT count(*) INTO v_opt_count
      FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb)) o
     WHERE nullif(btrim(COALESCE(o->>'text','')), '') IS NOT NULL
       AND nullif(btrim(COALESCE(o->>'id','')), '') IS NOT NULL;
    IF v_opt_count < 2 THEN
      RAISE EXCEPTION 'At least two options with text are required';
    END IF;
    IF nullif(btrim(COALESCE(p_correct_option_id,'')), '') IS NULL THEN
      RAISE EXCEPTION 'Select the correct option';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_options) o
       WHERE o->>'id' = p_correct_option_id
         AND nullif(btrim(COALESCE(o->>'text','')), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'The correct option must be one of the filled options';
    END IF;
  ELSIF p_type = 'numeric' THEN
    IF p_numeric_answer IS NULL THEN
      RAISE EXCEPTION 'Numeric answer is required';
    END IF;
    IF COALESCE(p_numeric_tolerance, 0) < 0 THEN
      RAISE EXCEPTION 'Tolerance cannot be negative';
    END IF;
  END IF;

  INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, applicable_role_codes,
                                    created_by, approved_by, approved_at)
  VALUES (p_type, v_tag, COALESCE(p_difficulty, 'medium'),
          CASE WHEN p_approve THEN 'approved'::public.cbt_question_status ELSE 'needs_review'::public.cbt_question_status END,
          CASE WHEN p_role_codes IS NULL OR array_length(p_role_codes,1) IS NULL THEN NULL ELSE p_role_codes END,
          auth.uid(),
          CASE WHEN p_approve THEN auth.uid() ELSE NULL END,
          CASE WHEN p_approve THEN now() ELSE NULL END)
  RETURNING id INTO v_q;

  INSERT INTO public.cbt_question_versions (question_id, version_no, content)
  VALUES (v_q, 1, jsonb_strip_nulls(jsonb_build_object(
    'prompt', v_prompt,
    'marks', p_marks,
    'options', CASE WHEN p_type = 'mcq' THEN (
        SELECT jsonb_agg(jsonb_build_object('id', o->>'id', 'text', btrim(o->>'text')) ORDER BY ord)
          FROM jsonb_array_elements(p_options) WITH ORDINALITY AS t(o, ord)
         WHERE nullif(btrim(COALESCE(o->>'text','')), '') IS NOT NULL
      ) ELSE NULL END)))
  RETURNING id INTO v_v;

  UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;

  INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id, numeric_answer,
                                        numeric_tolerance, rubric, explanation)
  VALUES (v_v,
          CASE WHEN p_type = 'mcq' THEN p_correct_option_id ELSE NULL END,
          CASE WHEN p_type = 'numeric' THEN p_numeric_answer ELSE NULL END,
          CASE WHEN p_type = 'numeric' THEN COALESCE(p_numeric_tolerance, 0) ELSE 0 END,
          CASE WHEN p_type = 'written' THEN p_rubric ELSE NULL END,
          nullif(btrim(COALESCE(p_explanation,'')), ''));

  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
  VALUES (auth.uid(), 'cbt_questions', v_q,
          CASE WHEN p_approve THEN 'create_question_approved' ELSE 'create_question' END,
          jsonb_build_object('type', p_type, 'category_tag', v_tag, 'difficulty', COALESCE(p_difficulty,'medium')));

  RETURN v_q;
END;
$$;

REVOKE ALL ON FUNCTION public.cbt_create_question(public.cbt_question_type, text, public.cbt_difficulty, text, numeric, jsonb, text, numeric, numeric, jsonb, text[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cbt_create_question(public.cbt_question_type, text, public.cbt_difficulty, text, numeric, jsonb, text, numeric, numeric, jsonb, text[], text, boolean) TO authenticated;