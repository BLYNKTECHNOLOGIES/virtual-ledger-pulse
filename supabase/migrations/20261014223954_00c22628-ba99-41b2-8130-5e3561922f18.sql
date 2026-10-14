
-- ============ QZ3a: pools, subjects, item editor, import, settings ============

-- 1. Pools on questions
ALTER TABLE public.cbt_questions ADD COLUMN IF NOT EXISTS pool text NOT NULL DEFAULT 'hiring';
ALTER TABLE public.cbt_questions DROP CONSTRAINT IF EXISTS cbt_questions_pool_check;
ALTER TABLE public.cbt_questions ADD CONSTRAINT cbt_questions_pool_check CHECK (pool IN ('hiring','staff','shared'));
UPDATE public.cbt_questions SET pool = CASE WHEN type IN ('typing_passage','data_entry_record','match_pair') THEN 'shared' ELSE 'hiring' END;

-- 2. Subjects (stable key = the old category_tag string)
CREATE TABLE IF NOT EXISTS public.cbt_subjects (
  key text PRIMARY KEY,
  pool text NOT NULL CHECK (pool IN ('hiring','staff','shared')),
  display_name text NOT NULL,
  description text,
  is_retired boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_subjects TO authenticated;
GRANT ALL ON public.cbt_subjects TO service_role;
ALTER TABLE public.cbt_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quiz staff read subjects" ON public.cbt_subjects;
CREATE POLICY "Quiz staff read subjects" ON public.cbt_subjects FOR SELECT TO authenticated USING (public.cbt_can_view());
DROP TRIGGER IF EXISTS cbt_subjects_touch ON public.cbt_subjects;
CREATE TRIGGER cbt_subjects_touch BEFORE UPDATE ON public.cbt_subjects FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

INSERT INTO public.cbt_subjects (key, pool, display_name)
SELECT DISTINCT ON (q.category_tag) q.category_tag,
  CASE WHEN bool_and(q.type IN ('typing_passage','data_entry_record','match_pair')) OVER (PARTITION BY q.category_tag) THEN 'shared' ELSE 'hiring' END,
  initcap(replace(q.category_tag,'_',' '))
FROM public.cbt_questions q WHERE q.category_tag IS NOT NULL
ON CONFLICT (key) DO NOTHING;
-- keys that sections already point at, even with no questions yet
INSERT INTO public.cbt_subjects (key, pool, display_name)
SELECT DISTINCT t, 'hiring', initcap(replace(t,'_',' '))
FROM public.cbt_role_sections s, unnest(s.category_tags) t
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.cbt_questions DROP CONSTRAINT IF EXISTS cbt_questions_subject_fk;
ALTER TABLE public.cbt_questions ADD CONSTRAINT cbt_questions_subject_fk FOREIGN KEY (category_tag)
  REFERENCES public.cbt_subjects(key) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- subject key is immutable
CREATE OR REPLACE FUNCTION public.cbt_subjects_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.key <> OLD.key THEN RAISE EXCEPTION 'A subject key never changes; rename the display name instead'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cbt_subjects_key_guard ON public.cbt_subjects;
CREATE TRIGGER cbt_subjects_key_guard BEFORE UPDATE ON public.cbt_subjects FOR EACH ROW EXECUTE FUNCTION public.cbt_subjects_guard();

CREATE OR REPLACE FUNCTION public.cbt_save_subject(p_key text, p_pool text, p_display_name text, p_description text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text := nullif(btrim(p_key),''); v_name text := nullif(btrim(p_display_name),''); old public.cbt_subjects;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  IF v_name IS NULL OR length(v_name) > 80 THEN RAISE EXCEPTION 'Enter a subject name (up to 80 characters)'; END IF;
  IF v_key IS NOT NULL THEN SELECT * INTO old FROM public.cbt_subjects WHERE key = v_key; END IF;
  IF old.key IS NOT NULL THEN
    UPDATE public.cbt_subjects SET display_name = v_name, description = nullif(btrim(COALESCE(p_description,'')),'') WHERE key = v_key;
    INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after)
    VALUES (auth.uid(), 'cbt_subjects', NULL, 'update_subject', to_jsonb(old), jsonb_build_object('key', v_key, 'display_name', v_name, 'description', p_description));
    RETURN v_key;
  END IF;
  IF p_pool NOT IN ('hiring','staff','shared') THEN RAISE EXCEPTION 'Choose a pool'; END IF;
  v_key := COALESCE(v_key, trim(both '_' from regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g')));
  IF v_key !~ '^[a-z0-9_]{2,60}$' THEN RAISE EXCEPTION 'Subject key must be 2–60 lowercase letters, digits or _'; END IF;
  IF p_pool = 'staff' THEN v_key := CASE WHEN v_key LIKE 'staff\_%' THEN v_key ELSE 'staff_' || v_key END; END IF;
  IF EXISTS (SELECT 1 FROM public.cbt_subjects WHERE key = v_key) THEN RAISE EXCEPTION 'A subject with key % already exists', v_key; END IF;
  INSERT INTO public.cbt_subjects (key, pool, display_name, description, created_by)
  VALUES (v_key, p_pool, v_name, nullif(btrim(COALESCE(p_description,'')),''), auth.uid());
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
  VALUES (auth.uid(), 'cbt_subjects', NULL, 'create_subject', jsonb_build_object('key', v_key, 'pool', p_pool, 'display_name', v_name));
  RETURN v_key;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_set_subject_retired(p_key text, p_retired boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  UPDATE public.cbt_subjects SET is_retired = p_retired WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subject not found'; END IF;
  INSERT INTO public.cbt_audit_log (actor_id, entity, action, after)
  VALUES (auth.uid(), 'cbt_subjects', CASE WHEN p_retired THEN 'retire_subject' ELSE 'restore_subject' END, jsonb_build_object('key', p_key));
END $$;

CREATE OR REPLACE FUNCTION public.cbt_delete_subject(p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n_q int; n_s int;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  SELECT count(*) INTO n_q FROM public.cbt_questions WHERE category_tag = p_key;
  SELECT count(*) INTO n_s FROM public.cbt_role_sections WHERE p_key = ANY(category_tags);
  IF n_q > 0 OR n_s > 0 THEN
    RAISE EXCEPTION 'This subject is used by % question(s) and % test section(s). Retire it instead.', n_q, n_s;
  END IF;
  DELETE FROM public.cbt_subjects WHERE key = p_key;
  INSERT INTO public.cbt_audit_log (actor_id, entity, action, before) VALUES (auth.uid(), 'cbt_subjects', 'delete_subject', jsonb_build_object('key', p_key));
END $$;

-- 3. Build + validate one item (shared by save and import)
CREATE OR REPLACE FUNCTION public.cbt_build_item(p_type text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE c jsonb := COALESCE(p->'content','{}'::jsonb); k jsonb := COALESCE(p->'key','{}'::jsonb);
  prompt text := nullif(btrim(COALESCE(c->>'prompt','')),''); marks numeric; n int; opts jsonb; txt text; words int;
  r jsonb; f text; d date; mn int; mx int; rub jsonb; cov jsonb; mnot jsonb; maxm numeric;
BEGIN
  marks := COALESCE(nullif(c->>'marks','')::numeric, 1);
  IF marks <= 0 OR marks > 100 THEN RAISE EXCEPTION 'Marks must be between 0 and 100'; END IF;
  IF p_type = 'mcq' THEN
    IF prompt IS NULL THEN RAISE EXCEPTION 'Enter the question text'; END IF;
    SELECT jsonb_agg(jsonb_build_object('id', COALESCE(nullif(o->>'id',''), chr(96 + ord::int)), 'text', btrim(COALESCE(o->>'text',''))) ORDER BY ord) INTO opts
      FROM jsonb_array_elements(COALESCE(c->'options','[]'::jsonb)) WITH ORDINALITY t(o, ord);
    n := COALESCE(jsonb_array_length(opts),0);
    IF n < 2 OR n > 6 THEN RAISE EXCEPTION 'An MCQ needs 2 to 6 options'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(opts) o WHERE o->>'text' = '') THEN RAISE EXCEPTION 'Every option needs text'; END IF;
    IF (SELECT count(DISTINCT lower(o->>'text')) FROM jsonb_array_elements(opts) o) < n THEN RAISE EXCEPTION 'Two options have the same text'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(opts) o WHERE o->>'id' = k->>'correct_option_id') THEN RAISE EXCEPTION 'Choose the one correct option'; END IF;
    RETURN jsonb_build_object('content', jsonb_build_object('prompt', prompt, 'marks', marks, 'options', opts),
      'key', jsonb_build_object('correct_option_id', k->>'correct_option_id', 'explanation', nullif(btrim(COALESCE(k->>'explanation','')),'')));
  ELSIF p_type = 'numeric' THEN
    IF prompt IS NULL THEN RAISE EXCEPTION 'Enter the question text'; END IF;
    IF nullif(k->>'numeric_answer','') IS NULL THEN RAISE EXCEPTION 'Enter the correct answer'; END IF;
    IF COALESCE(nullif(k->>'numeric_tolerance','')::numeric,0) < 0 THEN RAISE EXCEPTION 'Tolerance cannot be negative'; END IF;
    RETURN jsonb_build_object('content', jsonb_strip_nulls(jsonb_build_object('prompt', prompt, 'marks', marks, 'unit', nullif(btrim(COALESCE(c->>'unit','')),''))),
      'key', jsonb_build_object('numeric_answer', (k->>'numeric_answer')::numeric, 'numeric_tolerance', COALESCE(nullif(k->>'numeric_tolerance','')::numeric,0),
        'explanation', nullif(btrim(COALESCE(k->>'explanation','')),'')));
  ELSIF p_type = 'written' THEN
    IF prompt IS NULL THEN RAISE EXCEPTION 'Enter the question text'; END IF;
    mn := nullif(c->>'min_words','')::int; mx := nullif(c->>'max_words','')::int;
    IF mn IS NOT NULL AND mn < 0 OR mx IS NOT NULL AND mx < 1 OR (mn IS NOT NULL AND mx IS NOT NULL AND mn > mx) OR mx > 1000 THEN
      RAISE EXCEPTION 'Word limits are not valid (minimum must not exceed maximum; maximum up to 1000)'; END IF;
    rub := COALESCE(k->'rubric','{}'::jsonb);
    SELECT COALESCE(jsonb_agg(btrim(x)),'[]'::jsonb) INTO cov FROM jsonb_array_elements_text(COALESCE(rub->'covers','[]'::jsonb)) x WHERE btrim(x) <> '';
    SELECT COALESCE(jsonb_agg(btrim(x)),'[]'::jsonb) INTO mnot FROM jsonb_array_elements_text(COALESCE(rub->'must_not','[]'::jsonb)) x WHERE btrim(x) <> '';
    maxm := COALESCE(nullif(rub->>'max_marks','')::numeric, 20);
    IF maxm <= 0 OR maxm > 20 THEN RAISE EXCEPTION 'Marking guide maximum must be 1 to 20 marks'; END IF;
    IF jsonb_array_length(cov) = 0 THEN RAISE EXCEPTION 'Add at least one point a good answer covers'; END IF;
    RETURN jsonb_build_object('content', jsonb_strip_nulls(jsonb_build_object('prompt', prompt, 'marks', marks, 'min_words', mn, 'max_words', mx)),
      'key', jsonb_build_object('rubric', jsonb_build_object('covers', cov, 'must_not', mnot, 'max_marks', maxm)));
  ELSIF p_type = 'typing_passage' THEN
    txt := btrim(regexp_replace(COALESCE(c->>'passage', c->>'prompt', ''), '\s+', ' ', 'g'));
    words := COALESCE(array_length(regexp_split_to_array(nullif(txt,''), ' '),1),0);
    IF words < 40 THEN RAISE EXCEPTION '%', 'A typing passage needs at least 40 words - it has ' || words; END IF;
    IF txt ~ '[^\x20-\x7E]' THEN RAISE EXCEPTION 'Use plain keyboard characters only (no curly quotes, dashes or emoji)'; END IF;
    IF COALESCE(c->>'level','intermediate') NOT IN ('beginner','intermediate','advanced') THEN RAISE EXCEPTION 'Choose a level'; END IF;
    RETURN jsonb_build_object('content', jsonb_build_object('passage', txt, 'word_count', words, 'marks', marks, 'level', COALESCE(c->>'level','intermediate')),
      'key', '{}'::jsonb);
  ELSIF p_type = 'data_entry_record' THEN
    r := COALESCE(c->'record','{}'::jsonb);
    FOREACH f IN ARRAY ARRAY['name','pan','account_number','ifsc','utr','amount','txn_date'] LOOP
      IF nullif(btrim(COALESCE(r->>f,'')),'') IS NULL THEN txt := 'Fill in ' || replace(f,'_',' '); RAISE EXCEPTION '%', txt; END IF;
    END LOOP;
    IF r->>'pan' !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'PAN must look like ABCDE1234F'; END IF;
    IF r->>'ifsc' !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'IFSC must look like SBIN0001234'; END IF;
    IF r->>'account_number' !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Account number must be 9 to 18 digits'; END IF;
    IF r->>'utr' !~ '^[A-Z0-9]{8,22}$' THEN RAISE EXCEPTION 'UTR must be 8 to 22 capital letters or digits'; END IF;
    IF r->>'amount' !~ '^[0-9][0-9,]*(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Amount must be digits, commas and up to 2 decimals'; END IF;
    IF r->>'txn_date' !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN RAISE EXCEPTION 'Date must be DD/MM/YYYY'; END IF;
    BEGIN d := to_date(r->>'txn_date','DD/MM/YYYY'); IF to_char(d,'DD/MM/YYYY') <> r->>'txn_date' THEN RAISE EXCEPTION 'x'; END IF;
    EXCEPTION WHEN OTHERS THEN txt := 'Date ' || (r->>'txn_date') || ' is not a real date'; RAISE EXCEPTION '%', txt; END;
    IF length(btrim(r->>'name')) > 80 THEN RAISE EXCEPTION 'Name is too long'; END IF;
    RETURN jsonb_build_object('content', jsonb_build_object('prompt', COALESCE(prompt,'Copy every field exactly as printed.'), 'marks', marks,
      'record', jsonb_build_object('name', btrim(r->>'name'), 'pan', r->>'pan', 'account_number', r->>'account_number', 'ifsc', r->>'ifsc',
        'utr', r->>'utr', 'amount', r->>'amount', 'txn_date', r->>'txn_date')), 'key', '{}'::jsonb);
  ELSIF p_type = 'match_pair' THEN
    IF nullif(btrim(COALESCE(c->>'left','')),'') IS NULL OR nullif(btrim(COALESCE(c->>'right','')),'') IS NULL THEN RAISE EXCEPTION 'Fill in record A and record B'; END IF;
    IF k->'pair_is_match' IS NULL OR jsonb_typeof(k->'pair_is_match') <> 'boolean' THEN RAISE EXCEPTION 'Say whether the records match'; END IF;
    IF (k->>'pair_is_match')::boolean AND btrim(c->>'left') <> btrim(c->>'right') THEN RAISE EXCEPTION 'Marked as matching, but record A and B are not identical'; END IF;
    IF NOT (k->>'pair_is_match')::boolean AND btrim(c->>'left') = btrim(c->>'right') THEN RAISE EXCEPTION 'Marked as not matching, but the records are identical'; END IF;
    IF NOT (k->>'pair_is_match')::boolean AND nullif(btrim(COALESCE(k->>'explanation','')),'') IS NULL THEN RAISE EXCEPTION 'Say what differs'; END IF;
    RETURN jsonb_build_object('content', jsonb_build_object('prompt', COALESCE(prompt,'Do these two records refer to the same payment?'), 'marks', marks,
      'left', btrim(c->>'left'), 'right', btrim(c->>'right')),
      'key', jsonb_build_object('pair_is_match', (k->>'pair_is_match')::boolean, 'explanation', nullif(btrim(COALESCE(k->>'explanation','')),'')));
  END IF;
  RAISE EXCEPTION 'Unsupported item type %', p_type;
END $$;

-- 4. Save (create or edit) one item
CREATE OR REPLACE FUNCTION public.cbt_save_question(p_question_id uuid, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cbt_questions; v public.cbt_question_versions; oldk public.cbt_question_keys;
  built jsonb; v_type text; v_pool text; v_subject text; subj public.cbt_subjects; v_status text; v_new uuid;
  v_no int; key_changed boolean := false; content_changed boolean := false; new_version boolean := false; affected int := 0;
  roles text[];
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  IF p_question_id IS NOT NULL THEN
    SELECT * INTO q FROM public.cbt_questions WHERE id = p_question_id FOR UPDATE;
    IF q.id IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;
    v_type := q.type::text;
  ELSE
    v_type := p->>'type';
  END IF;
  IF v_type NOT IN ('mcq','numeric','written','typing_passage','data_entry_record','match_pair') THEN RAISE EXCEPTION 'Choose an item type'; END IF;
  v_pool := COALESCE(p->>'pool', q.pool, 'hiring');
  IF v_pool NOT IN ('hiring','staff','shared') THEN RAISE EXCEPTION 'Choose a pool'; END IF;
  IF v_pool = 'shared' AND v_type NOT IN ('typing_passage','data_entry_record','match_pair') THEN
    RAISE EXCEPTION 'Only typing passages, data-entry records and match pairs can be Shared'; END IF;
  v_subject := COALESCE(nullif(p->>'subject',''), q.category_tag);
  SELECT * INTO subj FROM public.cbt_subjects WHERE key = v_subject;
  IF subj.key IS NULL THEN RAISE EXCEPTION 'Choose a subject'; END IF;
  IF subj.pool <> v_pool AND NOT (subj.pool = 'shared' OR v_pool = 'shared') THEN
    RAISE EXCEPTION 'Subject "%" belongs to the % pool', subj.display_name, subj.pool; END IF;
  IF subj.is_retired AND (q.id IS NULL OR q.category_tag <> v_subject) THEN RAISE EXCEPTION 'Subject "%" is retired', subj.display_name; END IF;
  IF COALESCE(p->>'difficulty', q.difficulty::text, 'medium') NOT IN ('easy','medium','hard') THEN RAISE EXCEPTION 'Choose a difficulty'; END IF;
  IF p ? 'role_codes' THEN
    SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(x) END INTO roles FROM jsonb_array_elements_text(COALESCE(p->'role_codes','[]'::jsonb)) x WHERE btrim(x) <> '';
  ELSE roles := q.applicable_role_codes; END IF;

  built := public.cbt_build_item(v_type, p);

  IF q.id IS NULL THEN
    v_status := COALESCE(p->>'status','needs_review');
    IF v_status NOT IN ('draft','needs_review','approved') THEN RAISE EXCEPTION 'New items start as Draft, Needs review or Approved'; END IF;
    INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, applicable_role_codes, pool, created_by, approved_by, approved_at)
    VALUES (v_type::public.cbt_question_type, v_subject, (COALESCE(p->>'difficulty','medium'))::public.cbt_difficulty, v_status::public.cbt_question_status,
            roles, v_pool, auth.uid(), CASE WHEN v_status='approved' THEN auth.uid() END, CASE WHEN v_status='approved' THEN now() END)
    RETURNING * INTO q;
    INSERT INTO public.cbt_question_versions (question_id, version_no, content) VALUES (q.id, 1, built->'content') RETURNING * INTO v;
    UPDATE public.cbt_questions SET current_version_id = v.id WHERE id = q.id;
    INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id, numeric_answer, numeric_tolerance, pair_is_match, rubric, explanation)
    VALUES (v.id, built->'key'->>'correct_option_id', (built->'key'->>'numeric_answer')::numeric, COALESCE((built->'key'->>'numeric_tolerance')::numeric,0),
            (built->'key'->>'pair_is_match')::boolean, built->'key'->'rubric', built->'key'->>'explanation');
    INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
    VALUES (auth.uid(), 'cbt_questions', q.id, 'create_question', jsonb_build_object('type', v_type, 'pool', v_pool, 'subject', v_subject, 'status', v_status, 'content', built->'content'));
    RETURN jsonb_build_object('question_id', q.id, 'version_no', 1, 'new_version', false, 'key_changed', false, 'affected_attempts', 0);
  END IF;

  SELECT * INTO v FROM public.cbt_question_versions WHERE id = q.current_version_id;
  SELECT * INTO oldk FROM public.cbt_question_keys WHERE question_version_id = v.id;
  content_changed := v.content IS DISTINCT FROM (built->'content');
  key_changed := (oldk.correct_option_id IS DISTINCT FROM built->'key'->>'correct_option_id')
    OR (oldk.numeric_answer IS DISTINCT FROM (built->'key'->>'numeric_answer')::numeric)
    OR (v_type = 'numeric' AND oldk.numeric_tolerance IS DISTINCT FROM (built->'key'->>'numeric_tolerance')::numeric)
    OR (oldk.pair_is_match IS DISTINCT FROM (built->'key'->>'pair_is_match')::boolean)
    OR (v_type = 'written' AND oldk.rubric IS DISTINCT FROM built->'key'->'rubric');

  IF content_changed AND v.first_served_at IS NOT NULL THEN
    -- served versions are immutable: fork a new version with its own key
    SELECT COALESCE(max(version_no),0) + 1 INTO v_no FROM public.cbt_question_versions WHERE question_id = q.id;
    INSERT INTO public.cbt_question_versions (question_id, version_no, content) VALUES (q.id, v_no, built->'content') RETURNING id INTO v_new;
    INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id, numeric_answer, numeric_tolerance, pair_is_match, rubric, explanation)
    VALUES (v_new, built->'key'->>'correct_option_id', (built->'key'->>'numeric_answer')::numeric, COALESCE((built->'key'->>'numeric_tolerance')::numeric,0),
            (built->'key'->>'pair_is_match')::boolean, built->'key'->'rubric', built->'key'->>'explanation');
    UPDATE public.cbt_questions SET current_version_id = v_new WHERE id = q.id;
    new_version := true; key_changed := false; -- old attempts keep the key of what they saw
  ELSE
    v_no := v.version_no;
    IF content_changed THEN UPDATE public.cbt_question_versions SET content = built->'content' WHERE id = v.id; END IF;
    UPDATE public.cbt_question_keys SET correct_option_id = built->'key'->>'correct_option_id',
      numeric_answer = (built->'key'->>'numeric_answer')::numeric,
      numeric_tolerance = COALESCE((built->'key'->>'numeric_tolerance')::numeric,0),
      pair_is_match = (built->'key'->>'pair_is_match')::boolean,
      rubric = built->'key'->'rubric', explanation = built->'key'->>'explanation', updated_at = now()
    WHERE question_version_id = v.id;
    IF key_changed AND v.first_served_at IS NOT NULL THEN
      SELECT count(DISTINCT s.attempt_id) INTO affected FROM public.cbt_attempt_items i
        JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
        JOIN public.cbt_attempts a ON a.id = s.attempt_id
       WHERE i.question_version_id = v.id AND a.status IN ('submitted','auto_submitted','abandoned');
    END IF;
  END IF;

  UPDATE public.cbt_questions SET category_tag = v_subject, pool = v_pool,
    difficulty = (COALESCE(p->>'difficulty', q.difficulty::text))::public.cbt_difficulty, applicable_role_codes = roles, updated_at = now()
  WHERE id = q.id;

  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), 'cbt_questions', q.id,
    CASE WHEN new_version THEN 'edit_question_new_version' WHEN key_changed THEN 'correct_answer_key' ELSE 'edit_question' END,
    jsonb_build_object('version_no', v.version_no, 'content', v.content, 'key', to_jsonb(oldk) - 'question_version_id' - 'created_at' - 'updated_at',
      'subject', q.category_tag, 'pool', q.pool, 'difficulty', q.difficulty),
    jsonb_build_object('version_no', v_no, 'content', built->'content', 'key', built->'key', 'subject', v_subject, 'pool', v_pool, 'difficulty', p->>'difficulty'));

  RETURN jsonb_build_object('question_id', q.id, 'version_no', v_no, 'new_version', new_version, 'key_changed', key_changed, 'affected_attempts', affected);
END $$;

-- 5. Status: approve / submit for review / retire / restore
CREATE OR REPLACE FUNCTION public.cbt_set_question_status(p_question_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cbt_questions; v_to public.cbt_question_status;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  SELECT * INTO q FROM public.cbt_questions WHERE id = p_question_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;
  CASE p_action
    WHEN 'approve' THEN IF q.status NOT IN ('draft','needs_review') THEN RAISE EXCEPTION 'Only Draft or Needs review items can be approved'; END IF; v_to := 'approved';
    WHEN 'submit' THEN IF q.status <> 'draft' THEN RAISE EXCEPTION 'Only Draft items can be sent for review'; END IF; v_to := 'needs_review';
    WHEN 'retire' THEN IF q.status = 'retired' THEN RAISE EXCEPTION 'Already retired'; END IF; v_to := 'retired';
    WHEN 'restore' THEN IF q.status <> 'retired' THEN RAISE EXCEPTION 'Only retired items can be restored'; END IF;
      v_to := CASE WHEN q.approved_at IS NOT NULL THEN 'approved' ELSE 'needs_review' END;
    ELSE RAISE EXCEPTION 'Unknown action %', p_action;
  END CASE;
  UPDATE public.cbt_questions SET status = v_to,
    approved_by = CASE WHEN v_to = 'approved' AND p_action = 'approve' THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN v_to = 'approved' AND p_action = 'approve' THEN now() ELSE approved_at END,
    updated_at = now() WHERE id = q.id;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), 'cbt_questions', q.id, p_action || '_question', jsonb_build_object('status', q.status), jsonb_build_object('status', v_to), nullif(btrim(COALESCE(p_reason,'')),''));
  RETURN v_to::text;
END $$;

-- 6. Re-score after a key correction
CREATE OR REPLACE FUNCTION public.cbt_question_rescore_targets(p_question_id uuid)
RETURNS TABLE(attempt_id uuid, public_ref text, status text, decision text, decision_source text, total_score numeric, version_no int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (a.id) a.id, a.public_ref, a.status::text, a.decision::text, a.decision_source::text, a.total_score, v.version_no
  FROM public.cbt_question_versions v
  JOIN public.cbt_attempt_items i ON i.question_version_id = v.id
  JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
  JOIN public.cbt_attempts a ON a.id = s.attempt_id
  WHERE public.cbt_can_manage() AND v.question_id = p_question_id
    AND v.id = (SELECT current_version_id FROM public.cbt_questions WHERE id = p_question_id)
    AND a.status IN ('submitted','auto_submitted','abandoned')
  ORDER BY a.id
$$;

CREATE OR REPLACE FUNCTION public.cbt_rescore_question_attempts(p_question_id uuid, p_attempt_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid; n int := 0;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  FOR aid IN SELECT t.attempt_id FROM public.cbt_question_rescore_targets(p_question_id) t WHERE t.attempt_id = ANY(p_attempt_ids) LOOP
    PERFORM public.cbt_rescore_attempt(aid); n := n + 1;
  END LOOP;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
  VALUES (auth.uid(), 'cbt_questions', p_question_id, 'rescore_after_key_correction', jsonb_build_object('attempts', n));
  RETURN n;
END $$;

-- 7. Version history (staff only)
CREATE OR REPLACE FUNCTION public.cbt_question_history(p_question_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE jsonb_build_object(
    'versions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'version_no', v.version_no, 'content', v.content, 'created_at', v.created_at,
        'first_served_at', v.first_served_at, 'is_current', v.id = q.current_version_id,
        'served', (SELECT count(*) FROM public.cbt_attempt_items i WHERE i.question_version_id = v.id)) ORDER BY v.version_no DESC)
      FROM public.cbt_question_versions v WHERE v.question_id = q.id), '[]'::jsonb),
    'audit', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'reason', l.reason,
        'actor', (SELECT NULLIF(trim(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),'') FROM public.users u WHERE u.id = l.actor_id)) ORDER BY l.created_at DESC)
      FROM public.cbt_audit_log l WHERE l.entity = 'cbt_questions' AND l.entity_id = q.id), '[]'::jsonb)
  ) END
  FROM public.cbt_questions q WHERE q.id = p_question_id
$$;

-- 8. Bulk import (MCQ / numeric). Dry run validates every row and saves nothing.
CREATE OR REPLACE FUNCTION public.cbt_import_questions(p_rows jsonb, p_pool text, p_subject text, p_status text, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; idx int := 0; res jsonb := '[]'::jsonb; ok_n int := 0; msg text;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Quiz management permission required'; END IF;
  IF p_status NOT IN ('needs_review','approved') THEN RAISE EXCEPTION 'Import as Needs review or Approved'; END IF;
  IF p_pool NOT IN ('hiring','staff') THEN RAISE EXCEPTION 'Import into the Hiring or Staff pool'; END IF;
  IF jsonb_array_length(COALESCE(p_rows,'[]'::jsonb)) > 500 THEN RAISE EXCEPTION 'Import up to 500 rows at a time'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    idx := idx + 1;
    BEGIN
      IF COALESCE(r->>'type','') NOT IN ('mcq','numeric') THEN RAISE EXCEPTION 'Type must be mcq or numeric'; END IF;
      PERFORM public.cbt_save_question(NULL, jsonb_build_object('type', r->>'type', 'pool', p_pool, 'subject', p_subject, 'status', p_status,
        'difficulty', COALESCE(nullif(lower(r->>'difficulty'),''),'medium'), 'content', r->'content', 'key', r->'key'));
      IF p_dry_run THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__cbt_dry_ok__'; END IF;
      ok_n := ok_n + 1;
      res := res || jsonb_build_array(jsonb_build_object('row', idx, 'ok', true));
    EXCEPTION WHEN OTHERS THEN
      msg := SQLERRM;
      IF msg = '__cbt_dry_ok__' THEN ok_n := ok_n + 1; res := res || jsonb_build_array(jsonb_build_object('row', idx, 'ok', true));
      ELSE res := res || jsonb_build_array(jsonb_build_object('row', idx, 'ok', false, 'error', msg)); END IF;
    END;
  END LOOP;
  IF NOT p_dry_run THEN
    INSERT INTO public.cbt_audit_log (actor_id, entity, action, after)
    VALUES (auth.uid(), 'cbt_questions', 'bulk_import', jsonb_build_object('imported', ok_n, 'rows', idx, 'pool', p_pool, 'subject', p_subject, 'status', p_status));
  END IF;
  RETURN jsonb_build_object('rows', res, 'valid', ok_n, 'total', idx, 'imported', CASE WHEN p_dry_run THEN 0 ELSE ok_n END);
END $$;

-- 9. Settings (admins only)
CREATE OR REPLACE FUNCTION public.cbt_update_settings(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old public.cbt_settings; n public.cbt_settings;
  chk_int CONSTANT text := 'must be a whole number';
  FUNCTION_DUMMY int;
BEGIN
  IF NOT public.cbt_can_admin() THEN RAISE EXCEPTION 'Only Quiz administrators can change settings'; END IF;
  SELECT * INTO old FROM public.cbt_settings WHERE id FOR UPDATE;
  n := old;
  n.company_name := COALESCE(nullif(btrim(p->>'company_name'),''), old.company_name);
  n.brand_name := COALESCE(nullif(btrim(p->>'brand_name'),''), old.brand_name);
  IF p ? 'logo_url' THEN n.logo_url := nullif(btrim(p->>'logo_url'),''); END IF;
  IF p ? 'privacy_url' THEN n.privacy_url := nullif(btrim(p->>'privacy_url'),''); END IF;
  IF p ? 'terms_url' THEN n.terms_url := nullif(btrim(p->>'terms_url'),''); END IF;
  IF p ? 'hr_email' THEN n.hr_email := nullif(lower(btrim(p->>'hr_email')),''); END IF;
  IF p ? 'retention_days' THEN n.retention_days := (p->>'retention_days')::int; END IF;
  IF p ? 'max_warnings' THEN n.max_warnings := (p->>'max_warnings')::int; END IF;
  IF p ? 'on_warning_limit' THEN n.on_warning_limit := (p->>'on_warning_limit')::public.cbt_warning_action; END IF;
  IF p ? 'heartbeat_seconds' THEN n.heartbeat_seconds := (p->>'heartbeat_seconds')::int; END IF;
  IF p ? 'abandon_after_minutes' THEN n.abandon_after_minutes := (p->>'abandon_after_minutes')::int; END IF;
  IF p ? 'transition_seconds' THEN n.transition_seconds := (p->>'transition_seconds')::int; END IF;
  IF p ? 'deadline_grace_seconds' THEN n.deadline_grace_seconds := (p->>'deadline_grace_seconds')::int; END IF;
  IF p ? 'typing_practice_passage' THEN n.typing_practice_passage := btrim(regexp_replace(COALESCE(p->>'typing_practice_passage',''), '\s+', ' ', 'g')); END IF;

  IF length(n.company_name) > 120 OR length(n.brand_name) > 60 THEN RAISE EXCEPTION 'Company or brand name is too long'; END IF;
  IF n.logo_url IS NOT NULL AND n.logo_url !~ '^https://\S+$' THEN RAISE EXCEPTION 'Logo must be an https:// link'; END IF;
  IF n.privacy_url IS NOT NULL AND n.privacy_url !~ '^https://\S+$' THEN RAISE EXCEPTION 'Privacy link must start with https://'; END IF;
  IF n.terms_url IS NOT NULL AND n.terms_url !~ '^https://\S+$' THEN RAISE EXCEPTION 'Terms link must start with https://'; END IF;
  IF n.hr_email IS NULL OR n.hr_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid HR contact email'; END IF;
  IF n.retention_days NOT BETWEEN 30 AND 1095 THEN RAISE EXCEPTION 'Retention must be 30 to 1095 days'; END IF;
  IF n.max_warnings NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Warning limit must be 1 to 20'; END IF;
  IF n.heartbeat_seconds NOT BETWEEN 5 AND 60 THEN RAISE EXCEPTION 'Heartbeat must be 5 to 60 seconds'; END IF;
  IF n.abandon_after_minutes NOT BETWEEN 5 AND 240 THEN RAISE EXCEPTION 'Abandon-after must be 5 to 240 minutes'; END IF;
  IF n.abandon_after_minutes * 60 < n.heartbeat_seconds * 4 THEN RAISE EXCEPTION 'Abandon-after must be at least four heartbeats'; END IF;
  IF n.transition_seconds NOT BETWEEN 10 AND 600 THEN RAISE EXCEPTION 'Time between sections must be 10 to 600 seconds'; END IF;
  IF n.deadline_grace_seconds NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION 'Deadline grace must be 0 to 60 seconds'; END IF;
  IF length(n.typing_practice_passage) > 3000 THEN RAISE EXCEPTION 'Practice passage is too long (3000 characters max)'; END IF;
  IF n.typing_practice_passage ~ '[^\x20-\x7E]' THEN RAISE EXCEPTION 'Practice passage: use plain keyboard characters only'; END IF;

  UPDATE public.cbt_settings SET company_name = n.company_name, brand_name = n.brand_name, logo_url = n.logo_url, privacy_url = n.privacy_url,
    terms_url = n.terms_url, hr_email = n.hr_email, retention_days = n.retention_days, max_warnings = n.max_warnings, on_warning_limit = n.on_warning_limit,
    heartbeat_seconds = n.heartbeat_seconds, abandon_after_minutes = n.abandon_after_minutes, transition_seconds = n.transition_seconds,
    deadline_grace_seconds = n.deadline_grace_seconds, typing_practice_passage = n.typing_practice_passage, updated_at = now()
  WHERE id;
  INSERT INTO public.cbt_audit_log (actor_id, entity, action, before, after)
  VALUES (auth.uid(), 'cbt_settings', 'update_settings', to_jsonb(old), to_jsonb(n));
  RETURN to_jsonb(n);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Numbers must be whole numbers in range';
END $$;

-- 10. Analytics: add pool, subject name, editor content/key
DROP FUNCTION IF EXISTS public.cbt_question_bank_analytics();
CREATE FUNCTION public.cbt_question_bank_analytics()
 RETURNS TABLE(question_id uuid, type text, category_tag text, subject_name text, pool text, difficulty text, status text, times_served integer,
   applicable_role_codes text[], created_at timestamptz, version_no integer, version_count integer, current_served boolean, content jsonb, answer_key jsonb,
   prompt text, marks numeric, options jsonb, correct_option_id text, numeric_answer numeric, explanation text,
   served_items bigint, answered_items bigint, correct_items bigint, wrong_items bigint, skipped_items bigint, accuracy numeric, avg_marks numeric,
   last_served_at timestamptz, option_tally jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH item_stats AS (
    SELECT v.question_id, count(*) AS served_items,
           count(*) FILTER (WHERE i.response IS NOT NULL) AS answered_items,
           count(*) FILTER (WHERE i.is_correct IS TRUE) AS correct_items,
           count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL) AS wrong_items,
           count(*) FILTER (WHERE i.response IS NULL) AS skipped_items,
           avg(i.marks_awarded) AS avg_marks, max(coalesce(i.answered_at, i.created_at)) AS last_served_at
    FROM public.cbt_attempt_items i JOIN public.cbt_question_versions v ON v.id = i.question_version_id GROUP BY v.question_id),
  opt AS (
    SELECT v.question_id, i.response->>'option_id' AS option_id, count(*) AS picks
    FROM public.cbt_attempt_items i JOIN public.cbt_question_versions v ON v.id = i.question_version_id
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

-- 11. Attempt detail: return typing pass marks
CREATE OR REPLACE FUNCTION public.cbt_attempt_detail(p_attempt_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE (
    SELECT jsonb_build_object(
      'server_now', now(),
      'attempt', jsonb_build_object('id', a.id, 'public_ref', a.public_ref, 'status', a.status, 'auto_submit_reason', a.auto_submit_reason,
        'created_at', a.created_at, 'started_at', a.started_at, 'submitted_at', a.submitted_at, 'last_seen', a.last_heartbeat_at,
        'total_score', a.total_score, 'decision', a.decision, 'decision_reason', a.decision_reason, 'decision_source', a.decision_source,
        'warning_count', a.warning_count, 'is_sandbox', a.is_sandbox),
      'person', jsonb_build_object('full_name', c.full_name, 'mobile', c.mobile, 'email', c.email, 'city', c.city,
        'qualification', c.qualification, 'experience_years', c.experience_years, 'anonymized', c.anonymized_at IS NOT NULL),
      'drive', jsonb_build_object('id', d.id, 'name', d.name, 'code', d.access_code, 'mode', d.mode),
      'test', jsonb_build_object('name', j.name, 'code', j.code, 'shortlist_cutoff', j.shortlist_cutoff, 'hold_cutoff', j.hold_cutoff),
      'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'order_index', s.order_index, 'section_code', s.section_code, 'section_type', s.section_type,
          'title', COALESCE(cfg->>'title', s.section_code), 'status', s.status, 'started_at', s.started_at, 'deadline_at', s.deadline_at,
          'submitted_at', s.submitted_at, 'raw_score', s.raw_score, 'max_score', s.max_score, 'normalized_score', s.normalized_score,
          'gate_passed', s.gate_passed, 'gate_min_score', cfg->'gate_min_score',
          'gate_min_net_wpm', cfg->'gate_min_net_wpm', 'gate_min_accuracy', cfg->'gate_min_accuracy', 'weight', cfg->'weight',
          'duration_seconds', cfg->'duration_seconds', 'metrics', s.metrics,
          'extra_seconds', (SELECT COALESCE(sum(seconds),0) FROM public.cbt_time_extensions e WHERE e.attempt_section_id = s.id),
          'items_total', (SELECT count(*) FROM public.cbt_attempt_items i WHERE i.attempt_section_id = s.id),
          'items_correct', (SELECT count(*) FROM public.cbt_attempt_items i WHERE i.attempt_section_id = s.id AND i.is_correct IS TRUE),
          'items_wrong', (SELECT count(*) FROM public.cbt_attempt_items i WHERE i.attempt_section_id = s.id AND i.is_correct IS FALSE AND i.response IS NOT NULL AND i.response <> 'null'::jsonb),
          'items_skipped', (SELECT count(*) FROM public.cbt_attempt_items i WHERE i.attempt_section_id = s.id AND (i.response IS NULL OR i.response = 'null'::jsonb)),
          'written', CASE WHEN s.section_type = 'written' THEN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'prompt', v.content->>'prompt', 'answer', i.response->>'text', 'grade', w.total, 'comments', w.comments) ORDER BY i.display_order), '[]'::jsonb)
            FROM public.cbt_attempt_items i
            LEFT JOIN public.cbt_question_versions v ON v.id = i.question_version_id
            LEFT JOIN public.cbt_written_evaluations w ON w.attempt_item_id = i.id
            WHERE i.attempt_section_id = s.id) END
        ) ORDER BY s.order_index)
        FROM public.cbt_attempt_sections s CROSS JOIN LATERAL (SELECT public.cbt_section_config(s.id) cfg) k
        WHERE s.attempt_id = a.id), '[]'::jsonb),
      'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', e.event_type, 'at', e.occurred_at, 'meta', e.meta) ORDER BY e.occurred_at)
        FROM public.cbt_proctor_events e WHERE e.attempt_id = a.id), '[]'::jsonb),
      'audit', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'reason', l.reason,
          'actor', (SELECT NULLIF(trim(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),'') FROM public.users u WHERE u.id = l.actor_id)) ORDER BY l.created_at DESC)
        FROM public.cbt_audit_log l WHERE l.entity_id = a.id OR l.entity_id IN (SELECT id FROM public.cbt_attempt_sections WHERE attempt_id = a.id)), '[]'::jsonb)
    )
    FROM public.cbt_attempts a
    LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id
    LEFT JOIN public.cbt_drives d ON d.id = a.drive_id
    LEFT JOIN public.cbt_job_roles j ON j.id = a.job_role_id
    WHERE a.id = p_attempt_id) END
$function$;

REVOKE EXECUTE ON FUNCTION public.cbt_save_subject(text,text,text,text), public.cbt_set_subject_retired(text,boolean), public.cbt_delete_subject(text),
  public.cbt_save_question(uuid,jsonb), public.cbt_set_question_status(uuid,text,text), public.cbt_question_rescore_targets(uuid),
  public.cbt_rescore_question_attempts(uuid,uuid[]), public.cbt_question_history(uuid), public.cbt_import_questions(jsonb,text,text,text,boolean),
  public.cbt_update_settings(jsonb), public.cbt_question_bank_analytics() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cbt_save_subject(text,text,text,text), public.cbt_set_subject_retired(text,boolean), public.cbt_delete_subject(text),
  public.cbt_save_question(uuid,jsonb), public.cbt_set_question_status(uuid,text,text), public.cbt_question_rescore_targets(uuid),
  public.cbt_rescore_question_attempts(uuid,uuid[]), public.cbt_question_history(uuid), public.cbt_import_questions(jsonb,text,text,text,boolean),
  public.cbt_update_settings(jsonb), public.cbt_question_bank_analytics() TO authenticated, service_role;
