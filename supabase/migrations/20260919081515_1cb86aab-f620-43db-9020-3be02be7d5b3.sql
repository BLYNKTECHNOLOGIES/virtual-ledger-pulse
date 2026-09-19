ALTER TABLE public.cbt_role_sections ADD COLUMN IF NOT EXISTS skill_level text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cbt_role_sections_skill_level_chk') THEN
    ALTER TABLE public.cbt_role_sections
      ADD CONSTRAINT cbt_role_sections_skill_level_chk
      CHECK (skill_level IS NULL OR skill_level IN ('beginner','intermediate','advanced'));
  END IF;
END $$;

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
  v_skill_level text;
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
    v_skill_level := lower(nullif(btrim(coalesce(v_section->>'skill_level', '')), ''));

    IF v_index IS NULL OR v_index < 1 OR v_section_code = '' OR v_section_type IS NULL OR v_title IS NULL THEN
      RAISE EXCEPTION 'Every section needs an order, code, type, and title';
    END IF;
    IF v_item_count < 1 OR coalesce(v_duration_seconds, 0) < 30 THEN
      RAISE EXCEPTION 'Every section needs at least one item and a duration of at least 30 seconds';
    END IF;
    IF v_weight < 0 OR v_weight > 100 OR v_negative_mark < 0 THEN
      RAISE EXCEPTION 'Section weight must be 0–100 and negative marks cannot be below zero';
    END IF;
    IF v_skill_level IS NOT NULL AND v_skill_level NOT IN ('beginner','intermediate','advanced') THEN
      RAISE EXCEPTION 'Skill level must be beginner, intermediate, or advanced';
    END IF;

    INSERT INTO public.cbt_role_sections (
      job_role_id, order_index, section_code, section_type, title, category_tags,
      item_count, duration_seconds, weight, negative_mark, gate_min_score,
      gate_min_net_wpm, gate_min_accuracy, full_marks_wpm, practice_seconds,
      min_words, max_words, skill_level
    ) VALUES (
      v_role_id, v_index, v_section_code, v_section_type, v_title, v_tags,
      v_item_count, v_duration_seconds, v_weight, v_negative_mark,
      nullif(v_section->>'gate_min_score', '')::numeric,
      nullif(v_section->>'gate_min_net_wpm', '')::numeric,
      nullif(v_section->>'gate_min_accuracy', '')::numeric,
      nullif(v_section->>'full_marks_wpm', '')::numeric,
      coalesce(nullif(v_section->>'practice_seconds', '')::int, 0),
      nullif(v_section->>'min_words', '')::int,
      nullif(v_section->>'max_words', '')::int,
      v_skill_level
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

-- Seed data-entry records and match pairs so those two drills have content.
DO $$
DECLARE
  r record;
  v_q uuid;
  v_v uuid;
BEGIN
  IF (SELECT count(*) FROM public.cbt_questions WHERE type = 'data_entry_record') = 0 THEN
    FOR r IN
      SELECT * FROM (VALUES
        ('easy','{"prompt":"Copy every field exactly as printed.","record":{"name":"Ramesh Kumar Patel","pan":"AFZPK7190K","account_number":"50100238417653","ifsc":"HDFC0000123","utr":"HDFC1234567890","amount":"24500.00","txn_date":"04/09/2026"}}'),
        ('easy','{"prompt":"Copy every field exactly as printed.","record":{"name":"Sunita Devi Sharma","pan":"BKLPS4432M","account_number":"91820045637281","ifsc":"ICIC0004561","utr":"ICICN2209874531","amount":"7890.50","txn_date":"11/09/2026"}}'),
        ('easy','{"prompt":"Copy every field exactly as printed.","record":{"name":"Anil Vishwakarma","pan":"CDKPA9087L","account_number":"33445566778899","ifsc":"SBIN0011234","utr":"SBIN524098766","amount":"1250.00","txn_date":"15/08/2026"}}'),
        ('medium','{"prompt":"Copy every field exactly as printed.","record":{"name":"Mohd. Faizan Ummar Khan","pan":"EQWPK1123J","account_number":"000401558976231","ifsc":"UTIB0000401","utr":"AXISP00987654321","amount":"1,04,325.75","txn_date":"29/07/2026"}}'),
        ('medium','{"prompt":"Copy every field exactly as printed.","record":{"name":"Lakshmi Narasimhan Iyer","pan":"FRTPL5566N","account_number":"20049988776655","ifsc":"KKBK0008812","utr":"KKBKH22091144","amount":"63,410.20","txn_date":"02/09/2026"}}'),
        ('medium','{"prompt":"Copy every field exactly as printed.","record":{"name":"Priyanka Deshpande-Rao","pan":"GHYPD8899Q","account_number":"10987654321098","ifsc":"PUNB0234500","utr":"PUNB0098123456","amount":"9,999.99","txn_date":"18/09/2026"}}'),
        ('medium','{"prompt":"Copy every field exactly as printed.","record":{"name":"Vikram Singh Rathore","pan":"HJKPV2244R","account_number":"77001122334455","ifsc":"BARB0KHARGH","utr":"BARBR52200998","amount":"48,000.00","txn_date":"07/09/2026"}}'),
        ('medium','{"prompt":"Copy every field exactly as printed.","record":{"name":"Fatima Zohra Ansari","pan":"IKLPF6677S","account_number":"60110099887766","ifsc":"YESB0000123","utr":"YESBN229900771","amount":"2,340.10","txn_date":"22/08/2026"}}'),
        ('hard','{"prompt":"Copy every field exactly as printed.","record":{"name":"Jagadeeshwaran Balasubramaniam","pan":"JMNPJ3311T","account_number":"918020056473829","ifsc":"IDIB000M104","utr":"IDIBH2290011223","amount":"12,87,654.05","txn_date":"31/07/2026"}}'),
        ('hard','{"prompt":"Copy every field exactly as printed.","record":{"name":"Shrishti Raghunandan Chaturvedi","pan":"KNOPS7744U","account_number":"402100911223344","ifsc":"RATN0000088","utr":"RATNH229004411","amount":"5,00,000.00","txn_date":"09/09/2026"}}'),
        ('hard','{"prompt":"Copy every field exactly as printed.","record":{"name":"Abdul Rehman Sheikh Mohiuddin","pan":"LOPPA1188V","account_number":"550100778899001","ifsc":"INDB0000505","utr":"INDBN220099887","amount":"77,042.45","txn_date":"14/09/2026"}}'),
        ('hard','{"prompt":"Copy every field exactly as printed.","record":{"name":"Meenakshi Sundareswaran Nair","pan":"MPQPM9955W","account_number":"114400223355667","ifsc":"FDRL0001234","utr":"FDRLH229077665","amount":"3,61,900.90","txn_date":"26/08/2026"}}')
      ) AS t(diff, content)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('data_entry_record', 'data_entry', r.diff::public.cbt_difficulty, 'approved', now())
      RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;

  IF (SELECT count(*) FROM public.cbt_questions WHERE type = 'match_pair') = 0 THEN
    FOR r IN
      SELECT * FROM (VALUES
        ('easy','{"prompt":"Do these two records refer to the same payment?","left":"Ramesh Kumar Patel · A/c 50100238417653 · Rs 24,500.00","right":"Ramesh Kumar Patel · A/c 50100238417653 · Rs 24,500.00"}', true),
        ('easy','{"prompt":"Do these two records refer to the same payment?","left":"Sunita Devi Sharma · IFSC ICIC0004561 · Rs 7,890.50","right":"Sunita Devi Sharma · IFSC ICIC0004561 · Rs 7,890.05"}', false),
        ('easy','{"prompt":"Do these two records refer to the same payment?","left":"UTR SBIN524098766 · 15/08/2026","right":"UTR SBIN524098766 · 15/08/2026"}', true),
        ('easy','{"prompt":"Do these two records refer to the same payment?","left":"PAN AFZPK7190K · Anil Vishwakarma","right":"PAN AFZPK7T90K · Anil Vishwakarma"}', false),
        ('medium','{"prompt":"Do these two records refer to the same payment?","left":"Mohd. Faizan Ummar Khan · A/c 000401558976231","right":"Mohd Faizan Ummar Khan · A/c 000401558976231"}', true),
        ('medium','{"prompt":"Do these two records refer to the same payment?","left":"A/c 20049988776655 · Rs 63,410.20","right":"A/c 20049988767655 · Rs 63,410.20"}', false),
        ('medium','{"prompt":"Do these two records refer to the same payment?","left":"IFSC PUNB0234500 · Priyanka Deshpande-Rao","right":"IFSC PUNB0234S00 · Priyanka Deshpande-Rao"}', false),
        ('medium','{"prompt":"Do these two records refer to the same payment?","left":"Vikram Singh Rathore · UTR BARBR52200998 · Rs 48,000.00","right":"Vikram Singh Rathore · UTR BARBR52200998 · Rs 48,000.00"}', true),
        ('hard','{"prompt":"Do these two records refer to the same payment?","left":"Jagadeeshwaran Balasubramaniam · A/c 918020056473829 · Rs 12,87,654.05","right":"Jagadeeshwaran Balasubramaniam · A/c 918020056473829 · Rs 12,87,654.50"}', false),
        ('hard','{"prompt":"Do these two records refer to the same payment?","left":"Shrishti Raghunandan Chaturvedi · IFSC RATN0000088 · UTR RATNH229004411","right":"Shrishti Raghunandan Chaturvedi · IFSC RATN0000088 · UTR RATNH229004411"}', true),
        ('hard','{"prompt":"Do these two records refer to the same payment?","left":"Abdul Rehman Sheikh Mohiuddin · A/c 550100778899001 · 14/09/2026","right":"Abdul Rehman Sheikh Mohiuddin · A/c 550100778899O01 · 14/09/2026"}', false),
        ('hard','{"prompt":"Do these two records refer to the same payment?","left":"Meenakshi Sundareswaran Nair · Rs 3,61,900.90 · IFSC FDRL0001234","right":"Meenakshi Sundareswaran Nair · Rs 3,61,900.90 · IFSC FDRL0001234"}', true)
      ) AS t(diff, content, is_match)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('match_pair', 'match_pairs', r.diff::public.cbt_difficulty, 'approved', now())
      RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      INSERT INTO public.cbt_question_keys (question_version_id, pair_is_match)
      VALUES (v_v, r.is_match);
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;
END $$;

-- Label existing skill sections with a level, and add the two missing drills to the demo role.
UPDATE public.cbt_role_sections
   SET skill_level = 'intermediate'
 WHERE skill_level IS NULL
   AND section_type IN ('typing','data_entry','match_pairs','mental_maths','memory_recall');

DO $$
DECLARE
  v_role uuid;
  v_next int;
BEGIN
  SELECT r.id INTO v_role
    FROM public.cbt_job_roles r
    JOIN public.cbt_role_sections s ON s.job_role_id = r.id
   GROUP BY r.id
   ORDER BY count(s.id) DESC
   LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;

  SELECT coalesce(max(order_index), 0) INTO v_next FROM public.cbt_role_sections WHERE job_role_id = v_role;

  IF NOT EXISTS (SELECT 1 FROM public.cbt_role_sections WHERE job_role_id = v_role AND section_type = 'data_entry') THEN
    v_next := v_next + 1;
    INSERT INTO public.cbt_role_sections (job_role_id, order_index, section_code, section_type, title, category_tags, item_count, duration_seconds, weight, negative_mark, skill_level)
    VALUES (v_role, v_next, 'SKILL_DATA_ENTRY', 'data_entry', 'Skill Box — data entry', '{}', 4, 300, 10, 0, 'intermediate');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cbt_role_sections WHERE job_role_id = v_role AND section_type = 'match_pairs') THEN
    v_next := v_next + 1;
    INSERT INTO public.cbt_role_sections (job_role_id, order_index, section_code, section_type, title, category_tags, item_count, duration_seconds, weight, negative_mark, skill_level)
    VALUES (v_role, v_next, 'SKILL_MATCH_PAIRS', 'match_pairs', 'Skill Box — match pairs', '{}', 8, 240, 10, 0, 'intermediate');
  END IF;
END $$;