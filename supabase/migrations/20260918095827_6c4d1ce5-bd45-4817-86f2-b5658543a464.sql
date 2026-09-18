CREATE OR REPLACE FUNCTION public.cbt_save_role_blueprint(
  p_role_id uuid DEFAULT NULL,
  p_position_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_shortlist_cutoff numeric DEFAULT 65,
  p_hold_cutoff numeric DEFAULT 50,
  p_is_active boolean DEFAULT true,
  p_sections jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_position_id uuid;
  v_code text := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '_', 'g'));
  v_sections jsonb := coalesce(p_sections, '[]'::jsonb);
  v_section jsonb;
  v_index int;
  v_section_code text;
  v_section_type public.cbt_section_type;
  v_title text;
  v_tags text[];
  v_item_count int;
  v_duration_seconds int;
  v_weight numeric;
  v_negative_mark numeric;
BEGIN
  IF NOT public.cbt_can_manage() THEN
    RAISE EXCEPTION 'Quiz management permission required';
  END IF;

  IF coalesce(p_shortlist_cutoff, -1) < 0 OR p_shortlist_cutoff > 100
     OR coalesce(p_hold_cutoff, -1) < 0 OR p_hold_cutoff > 100 THEN
    RAISE EXCEPTION 'Shortlist and hold cut-offs must be between 0 and 100';
  END IF;
  IF p_hold_cutoff > p_shortlist_cutoff THEN
    RAISE EXCEPTION 'Hold cut-off cannot exceed shortlist cut-off';
  END IF;
  IF jsonb_typeof(v_sections) <> 'array' THEN
    RAISE EXCEPTION 'Blueprint sections must be an array';
  END IF;

  IF p_role_id IS NULL THEN
    IF p_position_id IS NULL THEN
      RAISE EXCEPTION 'Select a company position';
    END IF;
    IF v_code = '' THEN
      SELECT upper(regexp_replace(btrim(d.code || '_' || po.title), '[^A-Za-z0-9]+', '_', 'g'))
        INTO v_code
        FROM public.positions po
        JOIN public.departments d ON d.id = po.department_id
       WHERE po.id = p_position_id AND po.is_active = true;
    END IF;
    IF v_code IS NULL OR v_code = '' THEN
      RAISE EXCEPTION 'A valid role code is required';
    END IF;

    INSERT INTO public.cbt_job_roles (
      position_id, code, name, department_code, shortlist_cutoff, hold_cutoff, is_active
    ) VALUES (
      p_position_id, v_code, '', '', p_shortlist_cutoff, p_hold_cutoff, coalesce(p_is_active, true)
    ) RETURNING id INTO v_role_id;
  ELSE
    SELECT position_id INTO v_position_id
      FROM public.cbt_job_roles
     WHERE id = p_role_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Quiz role not found';
    END IF;
    IF p_position_id IS NOT NULL AND p_position_id <> v_position_id THEN
      RAISE EXCEPTION 'The linked company position cannot be changed';
    END IF;
    IF v_code = '' THEN
      RAISE EXCEPTION 'A valid role code is required';
    END IF;

    UPDATE public.cbt_job_roles
       SET code = v_code,
           shortlist_cutoff = p_shortlist_cutoff,
           hold_cutoff = p_hold_cutoff,
           is_active = coalesce(p_is_active, true)
     WHERE id = p_role_id;
    v_role_id := p_role_id;

    DELETE FROM public.cbt_role_sections WHERE job_role_id = v_role_id;
  END IF;

  FOR v_section IN SELECT value FROM jsonb_array_elements(v_sections)
  LOOP
    v_index := nullif(v_section->>'order_index', '')::int;
    v_section_code := upper(regexp_replace(btrim(coalesce(v_section->>'section_code', '')), '[^A-Za-z0-9]+', '_', 'g'));
    v_section_type := nullif(v_section->>'section_type', '')::public.cbt_section_type;
    v_title := nullif(btrim(v_section->>'title'), '');
    v_tags := ARRAY(SELECT btrim(value) FROM jsonb_array_elements_text(coalesce(v_section->'category_tags', '[]'::jsonb)) WHERE btrim(value) <> '');
    v_item_count := coalesce(nullif(v_section->>'item_count', '')::int, 1);
    v_duration_seconds := nullif(v_section->>'duration_seconds', '')::int;
    v_weight := coalesce(nullif(v_section->>'weight', '')::numeric, 0);
    v_negative_mark := coalesce(nullif(v_section->>'negative_mark', '')::numeric, 0);

    IF v_index IS NULL OR v_index < 1 OR v_section_code = '' OR v_section_type IS NULL OR v_title IS NULL THEN
      RAISE EXCEPTION 'Every section needs an order, code, type, and title';
    END IF;
    IF v_item_count < 1 OR coalesce(v_duration_seconds, 0) < 30 THEN
      RAISE EXCEPTION 'Every section needs at least one item and a duration of at least 30 seconds';
    END IF;
    IF v_weight < 0 OR v_weight > 100 OR v_negative_mark < 0 THEN
      RAISE EXCEPTION 'Section weight must be 0–100 and negative marks cannot be below zero';
    END IF;

    INSERT INTO public.cbt_role_sections (
      job_role_id, order_index, section_code, section_type, title, category_tags,
      item_count, duration_seconds, weight, negative_mark, gate_min_score,
      gate_min_net_wpm, gate_min_accuracy, full_marks_wpm, practice_seconds,
      min_words, max_words
    ) VALUES (
      v_role_id, v_index, v_section_code, v_section_type, v_title, v_tags,
      v_item_count, v_duration_seconds, v_weight, v_negative_mark,
      nullif(v_section->>'gate_min_score', '')::numeric,
      nullif(v_section->>'gate_min_net_wpm', '')::numeric,
      nullif(v_section->>'gate_min_accuracy', '')::numeric,
      nullif(v_section->>'full_marks_wpm', '')::numeric,
      coalesce(nullif(v_section->>'practice_seconds', '')::int, 0),
      nullif(v_section->>'min_words', '')::int,
      nullif(v_section->>'max_words', '')::int
    );
  END LOOP;

  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
  VALUES (
    auth.uid(), 'cbt_job_roles', v_role_id,
    CASE WHEN p_role_id IS NULL THEN 'created' ELSE 'blueprint_updated' END,
    jsonb_build_object('code', v_code, 'shortlist_cutoff', p_shortlist_cutoff,
      'hold_cutoff', p_hold_cutoff, 'is_active', p_is_active,
      'section_count', jsonb_array_length(v_sections))
  );

  RETURN v_role_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That role code, position, or section order is already in use';
END;
$$;

REVOKE ALL ON FUNCTION public.cbt_save_role_blueprint(uuid, uuid, text, numeric, numeric, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_save_role_blueprint(uuid, uuid, text, numeric, numeric, boolean, jsonb) TO authenticated, service_role;