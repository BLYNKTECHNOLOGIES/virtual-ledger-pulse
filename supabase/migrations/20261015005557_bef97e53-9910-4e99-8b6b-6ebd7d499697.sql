-- ===== columns / constraints =====
ALTER TABLE public.cbt_written_evaluations ADD COLUMN IF NOT EXISTS ai_raw text;
DO $c$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.cbt_written_evaluations'::regclass AND contype='c' LOOP
    EXECUTE format('ALTER TABLE public.cbt_written_evaluations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $c$;
ALTER TABLE public.cbt_written_evaluations
  ADD CONSTRAINT cbt_written_evaluations_ai_status_check CHECK (ai_status IN ('queued','processing','applied','suggested','unavailable','skipped')),
  ADD CONSTRAINT cbt_written_evaluations_graded_by_kind_check CHECK (graded_by_kind IN ('ai','human','auto'));
ALTER TABLE public.cbt_attempts ALTER COLUMN decision DROP DEFAULT, ALTER COLUMN decision DROP NOT NULL;

-- ===== helpers =====
CREATE OR REPLACE FUNCTION public.cbt_eval_attempt_ended(p_item uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.cbt_attempt_items i JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
                   JOIN public.cbt_attempts a ON a.id = s.attempt_id
                  WHERE i.id = p_item AND a.status IN ('submitted','auto_submitted'))
$$;
REVOKE ALL ON FUNCTION public.cbt_eval_attempt_ended(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_eval_attempt_ended(uuid) TO service_role;

CREATE OR REPLACE FUNCTION pg_temp.patch(def text, old text, new text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int := (length(def) - length(replace(def, old, ''))) / greatest(length(old),1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'QZ7a patch anchor found % times: %', n, left(old, 120); END IF;
  RETURN replace(def, old, new);
END $$;

-- ===== cbt_score_section: added time, WPM cap + burst, blank / abandoned written =====
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.cbt_score_section(uuid)'::regprocedure);
  d := pg_temp.patch(d, '  neg := COALESCE((cfg->>''negative_mark'')::numeric, 0);',
'  -- QZ7a: the real window includes time HR added
  duration := duration + COALESCE((SELECT SUM(te.seconds) FROM public.cbt_time_extensions te WHERE te.attempt_section_id = s.id), 0);
  neg := COALESCE((cfg->>''negative_mark'')::numeric, 0);');
  d := pg_temp.patch(d, '      net := round(((correct_chars / 5.0) / minutes)::numeric, 1);',
'      net := round(((correct_chars / 5.0) / minutes)::numeric, 1);
      -- QZ7a: an impossible speed is an integrity flag; scoring credits at most 120 net WPM
      met := met || jsonb_build_object(''net_wpm_uncapped'', net);
      IF net > 200 THEN met := met || jsonb_build_object(''integrity_burst'', true); END IF;
      net := LEAST(net, 120);');
  d := pg_temp.patch(d, '    INSERT INTO public.cbt_written_evaluations (attempt_item_id)',
'    -- QZ7a: abandoned / invalidated attempts are never graded; blank answers score 0 automatically (no AI, no check)
    IF NOT EXISTS (SELECT 1 FROM public.cbt_attempts xa WHERE xa.id = s.attempt_id AND xa.status IN (''abandoned'',''invalidated'')) THEN
    INSERT INTO public.cbt_written_evaluations (attempt_item_id, total, graded_by_kind, ai_status, ai_route_reason)');
  d := pg_temp.patch(d, '    SELECT ai.id FROM public.cbt_attempt_items ai WHERE ai.attempt_section_id = s.id',
'    SELECT ai.id, CASE WHEN x.blank THEN 0 END, CASE WHEN x.blank THEN ''auto'' END,
           CASE WHEN x.blank THEN ''skipped'' ELSE ''queued'' END, CASE WHEN x.blank THEN ''Blank answer: 0 automatically'' END
      FROM public.cbt_attempt_items ai CROSS JOIN LATERAL (SELECT COALESCE(ai.response->>''text'','''') ~ ''^[[:space:]]*$'' AS blank) x
     WHERE ai.attempt_section_id = s.id');
  d := pg_temp.patch(d, '    ON CONFLICT (attempt_item_id) DO NOTHING;',
'    ON CONFLICT (attempt_item_id) DO NOTHING;
    END IF;');
  EXECUTE d;
END $p$;

-- ===== cbt_finalize_attempt =====
CREATE OR REPLACE FUNCTION public.cbt_finalize_attempt(p_attempt_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  a public.cbt_attempts; r public.cbt_job_roles;
  total numeric; wsum numeric := 0; acc numeric := 0;
  dec public.cbt_decision; reason text;
  failed_gate text; flagged text; burst text; pending boolean := false; maxw int;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.cbt_job_roles WHERE id = a.job_role_id;
  SELECT max_warnings INTO maxw FROM public.cbt_settings WHERE id;

  SELECT SUM(COALESCE(s.normalized_score,0) * COALESCE((public.cbt_section_config(s.id)->>'weight')::numeric,0)),
         SUM(COALESCE((public.cbt_section_config(s.id)->>'weight')::numeric,0))
    INTO acc, wsum FROM public.cbt_attempt_sections s WHERE s.attempt_id = a.id;
  total := CASE WHEN COALESCE(wsum,0) = 0 THEN 0 ELSE round((acc / wsum)::numeric, 1) END;

  -- QZ7a: the total always refreshes; an HR decision is kept as is
  IF a.decision_source = 'manual' THEN
    UPDATE public.cbt_attempts SET total_score = total WHERE id = a.id; RETURN;
  END IF;
  -- QZ7a: no decision while the attempt is running
  IF a.status IN ('registered','in_progress') THEN
    UPDATE public.cbt_attempts SET total_score = total, decision = NULL, decision_reason = NULL, decision_source = 'auto' WHERE id = a.id;
    RETURN;
  END IF;

  SELECT s.section_code INTO failed_gate FROM public.cbt_attempt_sections s
   WHERE s.attempt_id = a.id AND s.gate_passed IS FALSE ORDER BY s.order_index LIMIT 1;
  SELECT s.section_code INTO flagged FROM public.cbt_attempt_sections s
   JOIN public.cbt_attempt_items i ON i.attempt_section_id = s.id
   WHERE s.attempt_id = a.id AND i.is_red_flag ORDER BY s.order_index LIMIT 1;
  SELECT s.section_code INTO burst FROM public.cbt_attempt_sections s
   WHERE s.attempt_id = a.id AND s.section_type = 'typing' AND COALESCE((s.metrics->>'integrity_burst')::boolean, false)
   ORDER BY s.order_index LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM public.cbt_attempt_sections s WHERE s.attempt_id = a.id AND s.section_type = 'written'
                   AND COALESCE((s.metrics->>'pending_grading')::boolean, false)) INTO pending;

  IF a.status IN ('abandoned','invalidated') THEN
    dec := 'incomplete';
    reason := CASE WHEN a.status = 'abandoned' THEN 'Abandoned' ELSE 'Invalidated: ' || COALESCE(a.auto_submit_reason,'no reason recorded') END;
  ELSIF a.status = 'auto_submitted' AND a.auto_submit_reason = 'warning_limit' THEN
    dec := 'hold'; reason := format('Proctoring review: auto-submitted after %s warnings', a.warning_count);
  ELSIF burst IS NOT NULL THEN
    dec := 'hold'; reason := 'Integrity review: typing';
  ELSIF failed_gate IS NOT NULL THEN
    dec := 'rejected'; reason := 'Gate failed: ' || failed_gate;
  ELSIF flagged IS NOT NULL THEN
    dec := 'hold'; reason := 'Integrity review: red-flag answer in ' || flagged;
  ELSIF a.warning_count > COALESCE(maxw, 3) THEN
    dec := 'hold'; reason := format('Proctoring review: %s warnings', a.warning_count);
  ELSIF pending THEN
    dec := 'pending_evaluation'; reason := 'Written answers awaiting evaluation';
  ELSIF total >= r.shortlist_cutoff THEN
    dec := 'shortlisted'; reason := format('Total %s met the shortlist cut-off of %s', total, r.shortlist_cutoff);
  ELSIF total >= r.hold_cutoff THEN
    dec := 'hold'; reason := format('Total %s met the hold cut-off of %s', total, r.hold_cutoff);
  ELSE
    dec := 'rejected'; reason := format('Total %s below the hold cut-off of %s', total, r.hold_cutoff);
  END IF;
  UPDATE public.cbt_attempts SET total_score = total, decision = dec, decision_reason = reason, decision_source = 'auto' WHERE id = a.id;
END $function$;

-- ===== cbt_ai_claim: only ended attempts, stop after 3 tries =====
CREATE OR REPLACE FUNCTION public.cbt_ai_claim(p_limit integer DEFAULT 5)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE st public.cbt_settings; used int; room int; out jsonb := '[]'::jsonb; r record;
BEGIN
  SELECT * INTO st FROM public.cbt_settings WHERE id;
  -- reclaim work stuck in processing; after 3 tries it goes to a person
  FOR r IN UPDATE public.cbt_written_evaluations
              SET ai_status = CASE WHEN ai_tries >= 3 THEN 'unavailable' ELSE 'queued' END, ai_next_at = now(),
                  ai_last_error = CASE WHEN ai_tries >= 3 THEN 'AI did not finish after 3 tries' ELSE ai_last_error END,
                  ai_route_reason = CASE WHEN ai_tries >= 3 THEN 'AI unavailable' ELSE ai_route_reason END
            WHERE ai_status='processing' AND updated_at < now() - interval '10 minutes' AND total IS NULL
            RETURNING id, ai_status LOOP
    IF r.ai_status = 'unavailable' THEN PERFORM public.cbt_ai_route_notice(r.id); END IF;
  END LOOP;

  IF NOT st.ai_grading_enabled THEN
    FOR r IN UPDATE public.cbt_written_evaluations SET ai_status='unavailable', ai_last_error='AI grading is turned off'
              WHERE ai_status='queued' AND total IS NULL AND public.cbt_eval_attempt_ended(attempt_item_id) RETURNING id LOOP
      PERFORM public.cbt_ai_route_notice(r.id);
    END LOOP;
    RETURN out;
  END IF;

  SELECT count(*) INTO used FROM public.cbt_ai_grading_log
   WHERE outcome IN ('ok','invalid') AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
  room := GREATEST(0, st.ai_daily_cap - used);
  IF room = 0 THEN
    FOR r IN UPDATE public.cbt_written_evaluations SET ai_status='unavailable', ai_last_error='Daily AI grading limit reached'
              WHERE ai_status='queued' AND total IS NULL AND public.cbt_eval_attempt_ended(attempt_item_id) RETURNING id LOOP
      PERFORM public.cbt_ai_route_notice(r.id);
    END LOOP;
    RETURN out;
  END IF;

  FOR r IN
    UPDATE public.cbt_written_evaluations e SET ai_status='processing', ai_tries = ai_tries + 1, updated_at = now()
     WHERE e.id IN (SELECT id FROM public.cbt_written_evaluations
                     WHERE ai_status='queued' AND total IS NULL AND ai_next_at <= now()
                       AND public.cbt_eval_attempt_ended(attempt_item_id)
                     ORDER BY created_at LIMIT LEAST(p_limit, room) FOR UPDATE SKIP LOCKED)
    RETURNING e.id, e.attempt_item_id, e.ai_tries
  LOOP
    out := out || (
      SELECT jsonb_build_object('evaluation_id', r.id, 'tries', r.ai_tries,
        'prompt', qv.content->>'prompt', 'scenario', qv.content->>'scenario',
        'rubric', k.rubric, 'min_words', COALESCE(NULLIF(cfg->>'min_words',''), NULLIF(qv.content->>'min_words','')), 'max_words', COALESCE(NULLIF(cfg->>'max_words',''), NULLIF(qv.content->>'max_words','')),
        'answer', COALESCE(i.response->>'text',''))
        FROM public.cbt_attempt_items i
        JOIN public.cbt_question_versions qv ON qv.id = i.question_version_id
        LEFT JOIN public.cbt_question_keys k ON k.question_version_id = qv.id
        CROSS JOIN LATERAL (SELECT public.cbt_section_config(i.attempt_section_id) cfg) c
       WHERE i.id = r.attempt_item_id);
  END LOOP;
  RETURN out;
END $function$;

-- ===== cbt_ai_record: raw output, 3 tries, never before the attempt ends =====
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.cbt_ai_record(uuid,text,text,jsonb,text,integer)'::regprocedure);
  d := pg_temp.patch(d, 'p_http integer DEFAULT NULL::integer)', 'p_http integer DEFAULT NULL::integer, p_raw text DEFAULT NULL::text)');
  d := pg_temp.patch(d, '  INSERT INTO public.cbt_ai_grading_log(evaluation_id, model, outcome, http_status) VALUES (p_eval_id, p_model, p_outcome, p_http);',
'  INSERT INTO public.cbt_ai_grading_log(evaluation_id, model, outcome, http_status) VALUES (p_eval_id, p_model, p_outcome, p_http);
  IF p_raw IS NOT NULL THEN UPDATE public.cbt_written_evaluations SET ai_raw = left(p_raw, 20000) WHERE id = e.id; END IF;
  -- QZ7a: grades are judged only on the final total, so nothing is applied before the attempt ends
  IF e.total IS NULL AND NOT public.cbt_eval_attempt_ended(e.attempt_item_id) THEN
    UPDATE public.cbt_written_evaluations SET ai_status = ''queued'', ai_next_at = now() WHERE id = e.id;
    RETURN jsonb_build_object(''route'',''waiting_for_attempt_end'');
  END IF;');
  d := pg_temp.patch(d, 'IF p_outcome = ''retry'' AND e.ai_tries < 4 THEN', 'IF p_outcome = ''retry'' AND e.ai_tries < 3 THEN');
  DROP FUNCTION public.cbt_ai_record(uuid,text,text,jsonb,text,integer);
  EXECUTE d;
END $p$;
REVOKE ALL ON FUNCTION public.cbt_ai_record(uuid,text,text,jsonb,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_ai_record(uuid,text,text,jsonb,text,integer,text) TO service_role;

-- ===== enqueue only real queued rows of ended attempts; kick when an attempt ends =====
DROP TRIGGER IF EXISTS trg_cbt_written_eval_enqueue ON public.cbt_written_evaluations;
CREATE OR REPLACE FUNCTION public.cbt_written_eval_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM new_rows n WHERE n.ai_status = 'queued' AND public.cbt_eval_attempt_ended(n.attempt_item_id)) THEN
    PERFORM public.cbt_kick_ai_grader();
  END IF;
  RETURN NULL;
END $function$;
CREATE TRIGGER trg_cbt_written_eval_enqueue AFTER INSERT ON public.cbt_written_evaluations
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.cbt_written_eval_enqueue();

CREATE OR REPLACE FUNCTION public.cbt_attempt_end_kick() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cbt_written_evaluations e JOIN public.cbt_attempt_items i ON i.id = e.attempt_item_id
               JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
              WHERE s.attempt_id = NEW.id AND e.ai_status = 'queued' AND e.total IS NULL) THEN
    PERFORM public.cbt_kick_ai_grader();
  END IF;
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS trg_cbt_attempt_end_kick ON public.cbt_attempts;
CREATE TRIGGER trg_cbt_attempt_end_kick AFTER UPDATE OF status ON public.cbt_attempts FOR EACH ROW
  WHEN (NEW.status IN ('submitted','auto_submitted') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cbt_attempt_end_kick();
REVOKE ALL ON FUNCTION public.cbt_attempt_end_kick() FROM PUBLIC, anon, authenticated;

-- ===== sweep: enter next section after an auto-submit; abandoned before scoring =====
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.cbt_sweep_attempt(uuid)'::regprocedure);
  d := pg_temp.patch(d, '    PERFORM public.cbt_score_section(s.id);
    changed := true;
  END LOOP;',
'    PERFORM public.cbt_score_section(s.id);
    changed := true;
  END LOOP;
  -- QZ7a: like cbt-submit-section, enter the next pending section so its countdown and auto-start run
  IF changed AND a.status = ''in_progress'' THEN
    SELECT * INTO nxt FROM public.cbt_attempt_sections WHERE attempt_id = a.id AND status = ''pending'' ORDER BY order_index LIMIT 1;
    IF nxt.id IS NOT NULL THEN
      UPDATE public.cbt_attempt_sections SET entered_at = COALESCE(entered_at, now()) WHERE id = nxt.id;
      UPDATE public.cbt_attempts SET current_section_index = nxt.order_index WHERE id = a.id;
    END IF;
  END IF;');
  d := pg_temp.patch(d, '    UPDATE public.cbt_attempts SET status = ''abandoned'', submitted_at = now() WHERE id = a.id;
', '');
  d := pg_temp.patch(d, '     WHERE attempt_id = a.id AND status IN (''pending'',''in_progress'');',
'     WHERE attempt_id = a.id AND status IN (''pending'',''in_progress'');
    UPDATE public.cbt_attempts SET status = ''abandoned'', submitted_at = now() WHERE id = a.id; -- QZ7a: before scoring, so nothing is sent to the AI');
  EXECUTE d;
END $p$;

CREATE OR REPLACE FUNCTION public.cbt_sweep_expired()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int := 0; r record; BEGIN
  FOR r IN SELECT a.id FROM public.cbt_attempts a
            WHERE a.status IN ('registered','in_progress') ORDER BY a.id LIMIT 500 LOOP
    PERFORM 1 FROM public.cbt_attempts WHERE id = r.id FOR UPDATE SKIP LOCKED;
    IF FOUND THEN PERFORM public.cbt_sweep_attempt(r.id); n := n + 1; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.cbt_written_evaluations
              WHERE total IS NULL AND ((ai_status = 'queued' AND ai_next_at <= now())
                 OR (ai_status = 'processing' AND updated_at < now() - interval '10 minutes'))
                AND public.cbt_eval_attempt_ended(attempt_item_id)) THEN
    PERFORM public.cbt_kick_ai_grader();
  END IF;
  RETURN n;
END $function$;

-- ===== Grading: ended attempts only, no automatic blanks =====
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.cbt_grading_queue(text)'::regprocedure);
  d := pg_temp.patch(d, 'WHERE NOT COALESCE(d.is_try_run,false)', 'WHERE NOT COALESCE(d.is_try_run,false) AND a.status IN (''submitted'',''auto_submitted'') AND COALESCE(e.graded_by_kind,'''') <> ''auto''');
  EXECUTE d;
  d := pg_get_functiondef('public.cbt_grading_counts()'::regprocedure);
  d := pg_temp.patch(d, 'WHERE NOT COALESCE(d.is_try_run,false)', 'WHERE NOT COALESCE(d.is_try_run,false) AND a.status IN (''submitted'',''auto_submitted'') AND COALESCE(e.graded_by_kind,'''') <> ''auto''');
  EXECUTE d;
END $p$;

-- ===== readiness after go-live =====
CREATE OR REPLACE FUNCTION public.cbt_live_readiness(p_role_id uuid DEFAULT NULL, p_drive_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_object_agg(d.id::text, public.cbt_drive_readiness(d.job_role_ids, false)), '{}'::jsonb)
    FROM public.cbt_drives d
   WHERE d.status = 'live' AND NOT d.is_sandbox
     AND (p_role_id IS NULL OR p_role_id = ANY(d.job_role_ids))
     AND (p_drive_id IS NULL OR d.id = p_drive_id)
$$;
CREATE OR REPLACE FUNCTION public.cbt_live_new_problems(p_before jsonb, p_after jsonb) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT string_agg(format('Live drive "%s" — %s', d.name, p.value #>> '{}'), '; ')
    FROM jsonb_each(COALESCE(p_after,'{}'::jsonb)) a(drive_id, probs)
    CROSS JOIN LATERAL jsonb_array_elements(a.probs) p(value)
    JOIN public.cbt_drives d ON d.id = a.drive_id::uuid
   WHERE NOT COALESCE(p_before->a.drive_id, '[]'::jsonb) @> jsonb_build_array(p.value)
$$;
REVOKE ALL ON FUNCTION public.cbt_live_readiness(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_live_new_problems(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_live_readiness(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_live_new_problems(jsonb,jsonb) TO authenticated, service_role;

ALTER FUNCTION public.cbt_save_drive(uuid,text,uuid[],timestamptz,timestamptz,text,boolean,boolean,text) RENAME TO cbt_save_drive_core;
ALTER FUNCTION public.cbt_save_role_blueprint(uuid,uuid,text,numeric,numeric,boolean,jsonb,integer) RENAME TO cbt_save_role_blueprint_core;
ALTER FUNCTION public.cbt_set_question_status(uuid,text,text) RENAME TO cbt_set_question_status_core;
REVOKE ALL ON FUNCTION public.cbt_save_drive_core(uuid,text,uuid[],timestamptz,timestamptz,text,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cbt_save_role_blueprint_core(uuid,uuid,text,numeric,numeric,boolean,jsonb,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cbt_set_question_status_core(uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.cbt_save_drive(p_drive_id uuid, p_name text, p_job_role_ids uuid[], p_starts_at timestamptz, p_ends_at timestamptz,
  p_mode text, p_show_scores boolean, p_is_sandbox boolean, p_access_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE before jsonb := '{}'::jsonb; res jsonb; probs text;
BEGIN
  IF p_drive_id IS NOT NULL THEN before := public.cbt_live_readiness(NULL, p_drive_id); END IF;
  res := public.cbt_save_drive_core(p_drive_id, p_name, p_job_role_ids, p_starts_at, p_ends_at, p_mode, p_show_scores, p_is_sandbox, p_access_code);
  probs := public.cbt_live_new_problems(before, public.cbt_live_readiness(NULL, (res->>'id')::uuid));
  IF probs IS NOT NULL THEN RAISE EXCEPTION 'Not saved — this drive is live and could not serve every section: %', probs; END IF;
  RETURN res;
END $function$;

CREATE FUNCTION public.cbt_save_role_blueprint(p_role_id uuid DEFAULT NULL::uuid, p_position_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text,
  p_shortlist_cutoff numeric DEFAULT 65, p_hold_cutoff numeric DEFAULT 50, p_is_active boolean DEFAULT true, p_sections jsonb DEFAULT '[]'::jsonb,
  p_retake_cooldown_days integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE before jsonb := '{}'::jsonb; rid uuid; probs text;
BEGIN
  IF p_role_id IS NOT NULL THEN before := public.cbt_live_readiness(p_role_id, NULL); END IF;
  rid := public.cbt_save_role_blueprint_core(p_role_id, p_position_id, p_code, p_shortlist_cutoff, p_hold_cutoff, p_is_active, p_sections, p_retake_cooldown_days);
  probs := public.cbt_live_new_problems(before, public.cbt_live_readiness(rid, NULL));
  IF probs IS NOT NULL THEN RAISE EXCEPTION 'Not saved — a live drive uses this test and could not serve every section: %', probs; END IF;
  RETURN rid;
END $function$;

CREATE FUNCTION public.cbt_set_question_status(p_question_id uuid, p_action text, p_reason text DEFAULT NULL::text, p_confirm boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE before jsonb; v text; probs text;
BEGIN
  IF p_action <> 'retire' THEN RETURN public.cbt_set_question_status_core(p_question_id, p_action, p_reason); END IF;
  before := public.cbt_live_readiness(NULL, NULL);
  v := public.cbt_set_question_status_core(p_question_id, p_action, p_reason);
  probs := public.cbt_live_new_problems(before, public.cbt_live_readiness(NULL, NULL));
  IF probs IS NOT NULL THEN
    IF NOT COALESCE(p_confirm, false) THEN RAISE EXCEPTION 'CONFIRM_RETIRE: %', probs; END IF;
    INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, after, reason)
    VALUES (auth.uid(), 'cbt_questions', p_question_id, 'retire_confirmed_live_impact', jsonb_build_object('problems', probs), 'Retired after confirming the live drives affected');
  END IF;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.cbt_save_drive(uuid,text,uuid[],timestamptz,timestamptz,text,boolean,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_save_role_blueprint(uuid,uuid,text,numeric,numeric,boolean,jsonb,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_set_question_status(uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_save_drive(uuid,text,uuid[],timestamptz,timestamptz,text,boolean,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_save_role_blueprint(uuid,uuid,text,numeric,numeric,boolean,jsonb,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_set_question_status(uuid,text,text,boolean) TO authenticated, service_role;

-- ===== 9.5: bank match pair 6ec39c77 — identical texts as a new version (still a match) =====
DO $p$ DECLARE oldv public.cbt_question_versions; newid uuid := gen_random_uuid(); BEGIN
  SELECT v.* INTO oldv FROM public.cbt_question_versions v JOIN public.cbt_questions q ON q.current_version_id = v.id
   WHERE q.id = '6ec39c77-bffc-4f76-a0c8-29a22c72ee72';
  IF oldv.id <> 'c4f47756-b135-47b5-8990-c818fa96392a' THEN RAISE EXCEPTION 'QZ7a: unexpected current version for 6ec39c77'; END IF;
  INSERT INTO public.cbt_question_versions (id, question_id, version_no, content)
  VALUES (newid, oldv.question_id, oldv.version_no + 1, jsonb_set(oldv.content, '{right}', oldv.content->'left'));
  INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id, numeric_answer, numeric_tolerance, sjt_scores, red_flag_option_ids, pair_is_match, rubric, explanation)
  SELECT newid, correct_option_id, numeric_answer, numeric_tolerance, sjt_scores, red_flag_option_ids, pair_is_match, rubric, explanation
    FROM public.cbt_question_keys WHERE question_version_id = oldv.id;
  UPDATE public.cbt_questions SET current_version_id = newid WHERE id = oldv.question_id;
  INSERT INTO public.cbt_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  VALUES (NULL, 'cbt_questions', oldv.question_id, 'new_version',
    jsonb_build_object('version_no', oldv.version_no, 'right', oldv.content->'right'),
    jsonb_build_object('version_no', oldv.version_no + 1, 'right', oldv.content->'left'),
    'QZ7a review fix: texts keyed as a match made identical; still a match, nothing re-scored');
END $p$;