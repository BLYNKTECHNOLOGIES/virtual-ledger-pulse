
DO $$
DECLARE
  v_pos uuid;
  v_role uuid;
  v_q uuid;
  v_v uuid;
  r record;
BEGIN
  SELECT id INTO v_pos FROM public.positions WHERE title = 'Operator' AND is_active LIMIT 1;
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'Operator position not found';
  END IF;

  -- role (one per position; skip if already linked)
  SELECT id INTO v_role FROM public.cbt_job_roles WHERE position_id = v_pos;
  IF v_role IS NULL THEN
    INSERT INTO public.cbt_job_roles (code, name, department_code, position_id, level, shortlist_cutoff, hold_cutoff, retake_cooldown_days, is_active)
    VALUES ('OPR', 'Operator', 'OPS', v_pos, 5, 65, 50, 0, true)
    RETURNING id INTO v_role;
  END IF;

  -- blueprint
  INSERT INTO public.cbt_role_sections (job_role_id, order_index, section_code, section_type, title, category_tags, item_count, duration_seconds, weight, negative_mark, gate_min_score)
  VALUES
    (v_role, 1, 'OBJ', 'objective', 'General aptitude', ARRAY['demo'], 5, 360, 70, 0, NULL),
    (v_role, 2, 'WRI', 'written', 'Short written answer', ARRAY['demo_written'], 1, 360, 30, 0, NULL)
  ON CONFLICT (job_role_id, order_index) DO NOTHING;

  UPDATE public.cbt_role_sections SET min_words = 40, max_words = 200
  WHERE job_role_id = v_role AND section_code = 'WRI';

  -- MCQ bank
  FOR r IN
    SELECT * FROM (VALUES
      ('A customer paid 4,500 and 3,500 for one order. What is the total received?',
       'Rs 7,000','Rs 8,000','Rs 8,500','Rs 9,000','b','easy'),
      ('If 1 USDT costs Rs 90, how much do 25 USDT cost?',
       'Rs 2,150','Rs 2,250','Rs 2,350','Rs 2,500','b','easy'),
      ('A shift runs 09:00 to 17:00 with a 45 minute break. How long is the working time?',
       '7 hours','7 hours 15 minutes','7 hours 30 minutes','8 hours','b','medium'),
      ('An order shows "Buyer paid" but the bank shows no credit. What is the correct first step?',
       'Release the coins anyway','Check the bank statement and confirm the credit before releasing','Cancel the order immediately','Ask the buyer to place a new order','b','medium'),
      ('Which detail must always match before a payment is accepted?',
       'The buyer profile photo','The verified name on the bank credit','The buyer chat language','The order colour tag','b','hard')
    ) AS t(prompt, o1, o2, o3, o4, correct, diff)
  LOOP
    IF EXISTS (SELECT 1 FROM public.cbt_question_versions WHERE content->>'prompt' = r.prompt) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, applicable_role_codes, approved_at)
    VALUES ('mcq', 'demo', r.diff::cbt_difficulty, 'approved', ARRAY['OPR'], now())
    RETURNING id INTO v_q;

    INSERT INTO public.cbt_question_versions (question_id, version_no, content)
    VALUES (v_q, 1, jsonb_build_object(
      'prompt', r.prompt,
      'marks', 1,
      'options', jsonb_build_array(
        jsonb_build_object('id','a','text',r.o1),
        jsonb_build_object('id','b','text',r.o2),
        jsonb_build_object('id','c','text',r.o3),
        jsonb_build_object('id','d','text',r.o4))))
    RETURNING id INTO v_v;

    UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id)
    VALUES (v_v, r.correct);
  END LOOP;

  -- written prompt
  IF NOT EXISTS (SELECT 1 FROM public.cbt_questions WHERE category_tag = 'demo_written') THEN
    INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, applicable_role_codes, approved_at)
    VALUES ('written', 'demo_written', 'medium', 'approved', ARRAY['OPR'], now())
    RETURNING id INTO v_q;

    INSERT INTO public.cbt_question_versions (question_id, version_no, content)
    VALUES (v_q, 1, jsonb_build_object(
      'prompt', 'A customer says he has paid, but you cannot see the money in the bank account. Write how you would handle this, step by step, in your own words.',
      'marks', 10))
    RETURNING id INTO v_v;

    UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    INSERT INTO public.cbt_question_keys (question_version_id, rubric)
    VALUES (v_v, jsonb_build_object('criteria', jsonb_build_array(
      jsonb_build_object('name','Checks the bank record first','max',4),
      jsonb_build_object('name','Communicates politely and clearly','max',3),
      jsonb_build_object('name','Escalates instead of releasing early','max',3))));
  END IF;

  -- live demo drive
  IF NOT EXISTS (SELECT 1 FROM public.cbt_drives WHERE access_code = 'DEMO24') THEN
    INSERT INTO public.cbt_drives (name, access_code, mode, starts_at, ends_at, job_role_ids, is_sandbox, show_score_to_candidate, status)
    VALUES ('Quiz Demo Drive (testing)', 'DEMO24', 'on_site', now() - interval '1 hour', now() + interval '30 days',
            ARRAY[v_role], true, true, 'live');
  ELSE
    UPDATE public.cbt_drives
    SET status = 'live', starts_at = now() - interval '1 hour', ends_at = now() + interval '30 days',
        job_role_ids = ARRAY[v_role], is_sandbox = true, show_score_to_candidate = true
    WHERE access_code = 'DEMO24';
  END IF;
END $$;
