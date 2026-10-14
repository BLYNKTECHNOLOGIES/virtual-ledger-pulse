
CREATE OR REPLACE FUNCTION public.cbt_new_access_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; tries int := 0;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted to manage drives'; END IF;
  LOOP
    c := '';
    FOR i IN 1..6 LOOP c := c || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cbt_drives WHERE access_code = c);
    tries := tries + 1; IF tries > 50 THEN RAISE EXCEPTION 'Could not generate a unique code'; END IF;
  END LOOP;
  RETURN c;
END $$;

-- What would stop each test in a drive from being served. Mirrors cbt-start-attempt selection.
CREATE OR REPLACE FUNCTION public.cbt_drive_readiness(p_job_role_ids uuid[], p_is_sandbox boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; s record; problems jsonb := '[]'::jsonb; have int; need int; st text[];
BEGIN
  IF NOT public.cbt_can_view() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  st := CASE WHEN p_is_sandbox THEN ARRAY['approved','needs_review','draft'] ELSE ARRAY['approved'] END;
  IF COALESCE(array_length(p_job_role_ids,1),0) = 0 THEN
    RETURN jsonb_build_array('Add at least one test to this drive.');
  END IF;
  FOR r IN SELECT * FROM public.cbt_job_roles WHERE id = ANY(p_job_role_ids) LOOP
    IF NOT r.is_active THEN problems := problems || to_jsonb(format('%s: this test is not active.', r.name)); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cbt_role_sections WHERE job_role_id = r.id) THEN
      problems := problems || to_jsonb(format('%s: this test has no sections.', r.name)); CONTINUE;
    END IF;
    FOR s IN SELECT * FROM public.cbt_role_sections WHERE job_role_id = r.id ORDER BY order_index LOOP
      IF s.section_type IN ('mental_maths','memory_recall') THEN CONTINUE; END IF;
      need := CASE WHEN s.section_type = 'typing' THEN 1 ELSE GREATEST(s.item_count,1) END;
      IF s.section_type::text NOT IN ('typing','data_entry','match_pairs','written','logical_reasoning','problem_solving','pattern_recognition','grammar','vocabulary')
         AND 'reading' = ANY(COALESCE(s.category_tags,'{}')) THEN
        SELECT count(*) INTO have FROM public.cbt_stimuli WHERE status::text = ANY(st);
        IF have = 0 THEN problems := problems || to_jsonb(format('%s · %s: no reading passage is available.', r.name, COALESCE(s.title, s.section_code))); END IF;
        CONTINUE;
      END IF;
      SELECT count(*) INTO have FROM public.cbt_questions q
       WHERE q.status::text = ANY(st) AND q.current_version_id IS NOT NULL
         AND (q.applicable_role_codes IS NULL OR r.code = ANY(q.applicable_role_codes))
         AND CASE s.section_type::text
           WHEN 'typing' THEN q.type::text = 'typing_passage' AND q.category_tag = ANY(CASE WHEN COALESCE(array_length(s.category_tags,1),0) > 0 THEN s.category_tags ELSE ARRAY['typing_passage'] END)
           WHEN 'data_entry' THEN q.type::text = 'data_entry_record'
           WHEN 'match_pairs' THEN q.type::text = 'match_pair'
           WHEN 'written' THEN q.type::text = 'written' AND (COALESCE(array_length(s.category_tags,1),0) = 0 OR q.category_tag = ANY(s.category_tags))
           WHEN 'objective' THEN q.type::text IN ('mcq','numeric','sjt') AND (COALESCE(array_length(s.category_tags,1),0) = 0 OR q.category_tag = ANY(s.category_tags))
           ELSE q.type::text = 'mcq' AND q.category_tag = s.section_type::text END;
      IF have < need THEN
        problems := problems || to_jsonb(format('%s · %s: needs %s %s question(s), %s available.', r.name, COALESCE(s.title, s.section_code), need,
          CASE WHEN p_is_sandbox THEN 'usable' ELSE 'approved' END, have));
      END IF;
    END LOOP;
  END LOOP;
  RETURN problems;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_save_drive(
  p_drive_id uuid, p_name text, p_job_role_ids uuid[], p_starts_at timestamptz, p_ends_at timestamptz,
  p_mode text, p_show_scores boolean, p_is_sandbox boolean, p_access_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.cbt_drives; before jsonb; code text; bad int;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted to manage drives'; END IF;
  IF COALESCE(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Enter a drive name.'; END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'The test window must end after it starts.'; END IF;
  IF p_mode NOT IN ('on_site','remote') THEN RAISE EXCEPTION 'Choose on-site or remote.'; END IF;
  IF COALESCE(array_length(p_job_role_ids,1),0) = 0 THEN RAISE EXCEPTION 'Choose at least one test.'; END IF;
  SELECT count(*) INTO bad FROM unnest(p_job_role_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.cbt_job_roles j WHERE j.id = x AND j.is_active);
  IF bad > 0 THEN RAISE EXCEPTION 'Only active hiring tests can be offered.'; END IF;
  code := upper(trim(COALESCE(p_access_code,'')));
  IF code = '' THEN code := public.cbt_new_access_code(); END IF;
  IF code !~ '^[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'The code must be 6 letters or digits.'; END IF;
  IF EXISTS (SELECT 1 FROM public.cbt_drives WHERE access_code = code AND id IS DISTINCT FROM p_drive_id) THEN
    RAISE EXCEPTION 'Another drive already uses code %.', code;
  END IF;
  IF p_drive_id IS NULL THEN
    INSERT INTO public.cbt_drives (name, access_code, mode, starts_at, ends_at, job_role_ids, is_sandbox, show_score_to_candidate, status, created_by)
    VALUES (trim(p_name), code, p_mode::public.cbt_drive_mode, p_starts_at, p_ends_at, p_job_role_ids, COALESCE(p_is_sandbox,false), COALESCE(p_show_scores,false), 'draft', auth.uid())
    RETURNING * INTO d;
    INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after) VALUES (auth.uid(), 'cbt_drives', d.id, 'create', to_jsonb(d));
  ELSE
    SELECT * INTO d FROM public.cbt_drives WHERE id = p_drive_id FOR UPDATE;
    IF d.id IS NULL THEN RAISE EXCEPTION 'Drive not found.'; END IF;
    before := to_jsonb(d);
    IF d.is_sandbox IS DISTINCT FROM COALESCE(p_is_sandbox,false)
       AND EXISTS (SELECT 1 FROM public.cbt_attempts WHERE drive_id = d.id) THEN
      RAISE EXCEPTION 'People have already taken this drive, so it can no longer switch between sandbox and real.';
    END IF;
    UPDATE public.cbt_drives SET name = trim(p_name), access_code = code, mode = p_mode::public.cbt_drive_mode,
      starts_at = p_starts_at, ends_at = p_ends_at, job_role_ids = p_job_role_ids,
      is_sandbox = COALESCE(p_is_sandbox,false), show_score_to_candidate = COALESCE(p_show_scores,false), updated_at = now()
     WHERE id = d.id RETURNING * INTO d;
    INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after) VALUES (auth.uid(), 'cbt_drives', d.id, 'update', before, to_jsonb(d));
  END IF;
  RETURN jsonb_build_object('id', d.id, 'access_code', d.access_code);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_set_drive_status(p_drive_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.cbt_drives; problems jsonb;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted to manage drives'; END IF;
  SELECT * INTO d FROM public.cbt_drives WHERE id = p_drive_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Drive not found.'; END IF;
  IF p_status NOT IN ('live','closed') THEN RAISE EXCEPTION 'Unknown status.'; END IF;
  IF p_status = 'live' THEN
    problems := public.cbt_drive_readiness(d.job_role_ids, d.is_sandbox);
    IF d.ends_at <= now() THEN problems := problems || to_jsonb('The test window has already ended. Move the end time later.'::text); END IF;
    IF jsonb_array_length(problems) > 0 THEN RETURN jsonb_build_object('ok', false, 'problems', problems); END IF;
  ELSIF d.status <> 'live' THEN
    RAISE EXCEPTION 'Only a live drive can be closed.';
  END IF;
  UPDATE public.cbt_drives SET status = p_status::public.cbt_drive_status, updated_at = now() WHERE id = d.id;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), 'cbt_drives', d.id, CASE WHEN p_status = 'closed' THEN 'close' WHEN d.status = 'closed' THEN 'reopen' ELSE 'go_live' END,
          jsonb_build_object('status', d.status), jsonb_build_object('status', p_status));
  RETURN jsonb_build_object('ok', true, 'problems', '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_issue_resume_code(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE a public.cbt_attempts; code text; exp timestamptz := now() + interval '30 minutes';
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found.'; END IF;
  IF a.status NOT IN ('registered','in_progress') THEN RAISE EXCEPTION 'This test has already ended.'; END IF;
  -- one active code per attempt: retire any earlier unused code
  UPDATE public.cbt_resume_codes SET expires_at = LEAST(expires_at, now()) WHERE attempt_id = a.id AND used_at IS NULL AND expires_at > now();
  code := lpad((floor(random()*1000000))::int::text, 6, '0');
  INSERT INTO public.cbt_resume_codes (attempt_id, code_hash, expires_at, issued_by)
  VALUES (a.id, encode(extensions.digest(code, 'sha256'), 'hex'), exp, auth.uid());
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after)
  VALUES (auth.uid(), 'cbt_attempts', a.id, 'issue_resume_code', jsonb_build_object('expires_at', exp));
  RETURN jsonb_build_object('code', code, 'expires_at', exp);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_add_section_time(p_attempt_id uuid, p_seconds int, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.cbt_attempts; s public.cbt_attempt_sections; newdl timestamptz;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_seconds IS NULL OR p_seconds < 10 OR p_seconds > 3600 THEN RAISE EXCEPTION 'Add between 10 seconds and 60 minutes.'; END IF;
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Enter a reason.'; END IF;
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL OR a.status NOT IN ('registered','in_progress') THEN RAISE EXCEPTION 'This test is not running.'; END IF;
  SELECT * INTO s FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status = 'in_progress' ORDER BY order_index LIMIT 1;
  IF s.id IS NULL THEN
    SELECT * INTO s FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status = 'pending' ORDER BY order_index LIMIT 1;
  END IF;
  IF s.id IS NULL THEN RAISE EXCEPTION 'No section is left to extend.'; END IF;
  INSERT INTO public.cbt_time_extensions (attempt_section_id, seconds, reason, granted_by) VALUES (s.id, p_seconds, trim(p_reason), auth.uid());
  IF s.status = 'in_progress' AND s.deadline_at IS NOT NULL THEN
    UPDATE public.cbt_attempt_sections SET deadline_at = deadline_at + make_interval(secs => p_seconds), updated_at = now()
     WHERE id = s.id RETURNING deadline_at INTO newdl;
  END IF;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), 'cbt_attempt_sections', s.id, 'add_time', jsonb_build_object('deadline_at', s.deadline_at),
          jsonb_build_object('seconds', p_seconds, 'deadline_at', newdl, 'section_status', s.status), trim(p_reason));
  RETURN jsonb_build_object('section_id', s.id, 'section_code', s.section_code, 'deadline_at', newdl, 'applies_on_start', s.status = 'pending');
END $$;

CREATE OR REPLACE FUNCTION public.cbt_invalidate_attempt(p_attempt_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.cbt_attempts;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Enter a reason.'; END IF;
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found.'; END IF;
  IF a.status = 'invalidated' THEN RAISE EXCEPTION 'Already invalidated.'; END IF;
  UPDATE public.cbt_attempt_sections SET status = 'auto_submitted', submitted_at = now(),
         metrics = COALESCE(metrics,'{}'::jsonb) || jsonb_build_object('auto_submit_reason','invalidated')
   WHERE attempt_id = a.id AND status IN ('pending','in_progress');
  UPDATE public.cbt_attempts SET status = 'invalidated', auto_submit_reason = trim(p_reason),
         submitted_at = COALESCE(submitted_at, now()), decision_source = 'auto', token_expires_at = now()
   WHERE id = a.id;
  PERFORM public.cbt_finalize_attempt(a.id);
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), 'cbt_attempts', a.id, 'invalidate', jsonb_build_object('status', a.status, 'decision', a.decision, 'decision_source', a.decision_source),
          jsonb_build_object('status','invalidated'), trim(p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.cbt_override_decision(p_attempt_id uuid, p_decision text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.cbt_attempts;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_decision NOT IN ('shortlisted','hold','rejected') THEN RAISE EXCEPTION 'Choose Shortlist, Hold or Reject.'; END IF;
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Enter a reason.'; END IF;
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found.'; END IF;
  IF a.status IN ('registered','in_progress') THEN RAISE EXCEPTION 'Wait until the test has ended.'; END IF;
  UPDATE public.cbt_attempts SET decision = p_decision::public.cbt_decision, decision_reason = 'HR: ' || trim(p_reason), decision_source = 'manual'
   WHERE id = a.id;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), 'cbt_attempts', a.id, 'override_decision',
          jsonb_build_object('decision', a.decision, 'decision_reason', a.decision_reason, 'decision_source', a.decision_source),
          jsonb_build_object('decision', p_decision, 'decision_source', 'manual'), trim(p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.cbt_restore_auto_decision(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.cbt_attempts;
BEGIN
  IF NOT public.cbt_can_manage() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found.'; END IF;
  IF a.decision_source <> 'manual' THEN RAISE EXCEPTION 'This decision is already automatic.'; END IF;
  UPDATE public.cbt_attempts SET decision_source = 'auto' WHERE id = a.id;
  PERFORM public.cbt_finalize_attempt(a.id);
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after)
  SELECT auth.uid(), 'cbt_attempts', a.id, 'restore_auto_decision',
         jsonb_build_object('decision', a.decision, 'decision_source', 'manual'),
         jsonb_build_object('decision', x.decision, 'decision_source', 'auto')
    FROM public.cbt_attempts x WHERE x.id = a.id;
END $$;

-- ---------- read models ----------
CREATE OR REPLACE FUNCTION public.cbt_drives_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) END
  FROM (
    SELECT to_jsonb(d) || jsonb_build_object(
      'tests', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'code', j.code) ORDER BY j.name), '[]'::jsonb) FROM public.cbt_job_roles j WHERE j.id = ANY(d.job_role_ids)),
      'registered', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id),
      'testing', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id AND a.status = 'in_progress'),
      'submitted', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id AND a.status IN ('submitted','auto_submitted'))
    ) AS row
    FROM public.cbt_drives d
  ) t
$$;

CREATE OR REPLACE FUNCTION public.cbt_drive_monitor(p_drive_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE jsonb_build_object(
    'server_now', now(),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'public_ref', a.public_ref, 'person', c.full_name, 'mobile', c.mobile,
        'test', j.name, 'status', a.status, 'warning_count', a.warning_count,
        'last_seen', a.last_heartbeat_at, 'started_at', a.started_at, 'created_at', a.created_at,
        'submitted_at', a.submitted_at, 'total_score', a.total_score, 'decision', a.decision,
        'section', (SELECT jsonb_build_object('title', COALESCE(public.cbt_section_config(s.id)->>'title', s.section_code),
                      'status', s.status, 'deadline_at', s.deadline_at, 'order_index', s.order_index,
                      'of', (SELECT count(*) FROM public.cbt_attempt_sections x WHERE x.attempt_id = a.id))
                    FROM public.cbt_attempt_sections s WHERE s.attempt_id = a.id AND s.status IN ('in_progress','pending')
                    ORDER BY (s.status = 'in_progress') DESC, s.order_index LIMIT 1)
      ) ORDER BY (a.status = 'in_progress') DESC, a.created_at DESC)
      FROM public.cbt_attempts a
      LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id
      LEFT JOIN public.cbt_job_roles j ON j.id = a.job_role_id
      WHERE a.drive_id = p_drive_id), '[]'::jsonb)
  ) END
$$;

CREATE OR REPLACE FUNCTION public.cbt_results(
  p_drive_id uuid DEFAULT NULL, p_job_role_id uuid DEFAULT NULL, p_status text DEFAULT NULL, p_decision text DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_search text DEFAULT NULL, p_include_sandbox boolean DEFAULT false,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE total bigint; rows jsonb; q text := NULLIF(lower(trim(COALESCE(p_search,''))), '');
BEGIN
  IF NOT public.cbt_can_view() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  WITH f AS (
    SELECT a.*, c.full_name, c.mobile, j.name AS test_name, d.name AS drive_name
      FROM public.cbt_attempts a
      LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id
      LEFT JOIN public.cbt_job_roles j ON j.id = a.job_role_id
      LEFT JOIN public.cbt_drives d ON d.id = a.drive_id
     WHERE (p_include_sandbox OR NOT a.is_sandbox)
       AND (p_drive_id IS NULL OR a.drive_id = p_drive_id)
       AND (p_job_role_id IS NULL OR a.job_role_id = p_job_role_id)
       AND (p_status IS NULL OR a.status::text = p_status OR (p_status = 'submitted' AND a.status::text = 'auto_submitted'))
       AND (p_decision IS NULL OR a.decision::text = p_decision)
       AND (p_from IS NULL OR (a.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_from)
       AND (p_to IS NULL OR (a.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_to)
       AND (q IS NULL OR lower(a.public_ref) LIKE '%'||q||'%' OR lower(COALESCE(c.full_name,'')) LIKE '%'||q||'%' OR COALESCE(c.mobile,'') LIKE '%'||q||'%')
  )
  SELECT (SELECT count(*) FROM f),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id', id, 'public_ref', public_ref, 'person', full_name, 'mobile', mobile, 'test', test_name, 'drive', drive_name,
           'status', status, 'total_score', total_score, 'decision', decision, 'decision_source', decision_source,
           'decision_reason', decision_reason, 'warning_count', warning_count, 'is_sandbox', is_sandbox,
           'created_at', created_at, 'started_at', started_at, 'submitted_at', submitted_at) ORDER BY created_at DESC)
           FROM (SELECT * FROM f ORDER BY created_at DESC LIMIT LEAST(GREATEST(p_limit,1),5000) OFFSET GREATEST(p_offset,0)) p), '[]'::jsonb)
    INTO total, rows;
  RETURN jsonb_build_object('total', total, 'rows', rows);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_attempt_detail(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
          'gate_passed', s.gate_passed, 'gate_min_score', cfg->'gate_min_score', 'weight', cfg->'weight',
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
$$;

CREATE OR REPLACE FUNCTION public.cbt_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE jsonb_build_object(
    'live_drives', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'code', d.access_code, 'ends_at', d.ends_at, 'is_sandbox', d.is_sandbox,
        'testing', (SELECT count(*) FROM public.cbt_attempts a WHERE a.drive_id = d.id AND a.status = 'in_progress')) ORDER BY d.ends_at), '[]'::jsonb)
      FROM public.cbt_drives d WHERE d.status = 'live'),
    'testing_now', (SELECT count(*) FROM public.cbt_attempts WHERE status = 'in_progress'),
    'submitted_today', (SELECT count(*) FROM public.cbt_attempts WHERE NOT is_sandbox AND status IN ('submitted','auto_submitted')
        AND (submitted_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'awaiting_grading', (SELECT count(*) FROM public.cbt_written_evaluations WHERE total IS NULL),
    'week', (SELECT jsonb_build_object(
        'shortlisted', count(*) FILTER (WHERE decision = 'shortlisted'),
        'hold', count(*) FILTER (WHERE decision = 'hold'),
        'rejected', count(*) FILTER (WHERE decision = 'rejected'))
      FROM public.cbt_attempts WHERE NOT is_sandbox AND submitted_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),
    'latest', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'submitted_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', a.id, 'public_ref', a.public_ref, 'person', c.full_name, 'test', j.name,
          'total_score', a.total_score, 'decision', a.decision, 'decision_source', a.decision_source, 'submitted_at', a.submitted_at, 'is_sandbox', a.is_sandbox) x
        FROM public.cbt_attempts a LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id LEFT JOIN public.cbt_job_roles j ON j.id = a.job_role_id
        WHERE a.submitted_at IS NOT NULL ORDER BY a.submitted_at DESC LIMIT 8) t)
  ) END
$$;

-- Sweep: the automatic start after a transition now honours time HR already added to that section.
CREATE OR REPLACE FUNCTION public.cbt_sweep_attempt(p_attempt_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  a public.cbt_attempts; cfgset public.cbt_settings; s record; cfg jsonb; nxt record; changed boolean := false;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL OR a.status NOT IN ('registered','in_progress') THEN RETURN; END IF;
  SELECT * INTO cfgset FROM public.cbt_settings WHERE id;

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

  IF a.status = 'in_progress'
     AND NOT EXISTS (SELECT 1 FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status = 'in_progress') THEN
    SELECT * INTO nxt FROM public.cbt_attempt_sections
      WHERE attempt_id = a.id AND status = 'pending' AND section_type <> 'typing' ORDER BY order_index LIMIT 1;
    IF nxt.id IS NOT NULL AND nxt.entered_at IS NOT NULL
       AND now() > nxt.entered_at + make_interval(secs => COALESCE(cfgset.transition_seconds,60)) THEN
      cfg := public.cbt_section_config(nxt.id);
      UPDATE public.cbt_attempt_sections
         SET status = 'in_progress', started_at = now(),
             deadline_at = now() + make_interval(secs => COALESCE((cfg->>'duration_seconds')::int, 300)
               + COALESCE((SELECT SUM(seconds) FROM public.cbt_time_extensions WHERE attempt_section_id = nxt.id),0))
       WHERE id = nxt.id;
      UPDATE public.cbt_attempts SET current_section_index = nxt.order_index WHERE id = a.id;
      changed := true;
    END IF;
  END IF;

  IF a.status = 'in_progress' AND a.last_heartbeat_at IS NOT NULL
     AND now() > a.last_heartbeat_at + make_interval(mins => COALESCE(cfgset.abandon_after_minutes,20)) THEN
    UPDATE public.cbt_attempt_sections
       SET status = 'auto_submitted', submitted_at = now()
     WHERE attempt_id = a.id AND status IN ('pending','in_progress');
    FOR s IN SELECT id FROM public.cbt_attempt_sections WHERE attempt_id = a.id ORDER BY order_index LOOP
      PERFORM public.cbt_score_section(s.id);
    END LOOP;
    UPDATE public.cbt_attempts SET status = 'abandoned', submitted_at = now() WHERE id = a.id;
    a.status := 'abandoned';
    changed := true;
  END IF;

  IF (SELECT COUNT(*) FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status IN ('pending','in_progress')) = 0
     AND a.status = 'in_progress' THEN
    UPDATE public.cbt_attempts SET status = 'submitted', submitted_at = COALESCE(submitted_at, now()) WHERE id = a.id;
    changed := true;
  END IF;

  IF changed THEN PERFORM public.cbt_finalize_attempt(a.id); END IF;
END $function$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['cbt_new_access_code()','cbt_drive_readiness(uuid[],boolean)',
    'cbt_save_drive(uuid,text,uuid[],timestamptz,timestamptz,text,boolean,boolean,text)','cbt_set_drive_status(uuid,text)',
    'cbt_issue_resume_code(uuid)','cbt_add_section_time(uuid,int,text)','cbt_invalidate_attempt(uuid,text)',
    'cbt_override_decision(uuid,text,text)','cbt_restore_auto_decision(uuid)','cbt_drives_list()','cbt_drive_monitor(uuid)',
    'cbt_results(uuid,uuid,text,text,date,date,text,boolean,int,int)','cbt_attempt_detail(uuid)','cbt_overview()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
