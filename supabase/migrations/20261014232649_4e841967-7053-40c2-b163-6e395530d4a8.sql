-- lovable-cron-fallback-reviewed: retry job is armed only while an AI grading retry is pending and unscheduled by the worker once the queue drains (wake-on-enqueue via trigger)
ALTER TABLE public.cbt_written_evaluations
  ADD COLUMN IF NOT EXISTS graded_by_kind text CHECK (graded_by_kind IN ('ai','human')),
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'queued' CHECK (ai_status IN ('queued','processing','applied','suggested','unavailable')),
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_result jsonb,
  ADD COLUMN IF NOT EXISTS ai_suggested_total numeric,
  ADD COLUMN IF NOT EXISTS ai_route_reason text,
  ADD COLUMN IF NOT EXISTS ai_graded_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_tries int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_next_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ai_last_error text;

-- existing rows: already-graded ones were graded by a person; the one pending answer is queued
UPDATE public.cbt_written_evaluations SET graded_by_kind='human', ai_status='unavailable', ai_last_error='Graded before AI grading existed'
 WHERE total IS NOT NULL;

ALTER TABLE public.cbt_settings
  ADD COLUMN IF NOT EXISTS ai_grading_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_confidence_threshold numeric NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS ai_borderline_margin numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_daily_cap int NOT NULL DEFAULT 200;

CREATE TABLE IF NOT EXISTS public.cbt_ai_grading_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES public.cbt_written_evaluations(id) ON DELETE SET NULL,
  model text, outcome text NOT NULL, http_status int, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cbt_ai_grading_log TO service_role;
ALTER TABLE public.cbt_ai_grading_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cbt_grading_notices (
  attempt_id uuid PRIMARY KEY REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cbt_grading_notices TO service_role;
ALTER TABLE public.cbt_grading_notices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cbt_written_eval_ai_queue_idx ON public.cbt_written_evaluations (ai_status, ai_next_at) WHERE total IS NULL;

-- ---------- §0.1 match pairs: penalise only answered-wrong pairs; record skipped ----------
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.cbt_score_section(uuid)'::regprocedure);
  src := replace(src,
$a$      n_total := n_total + 1;
      IF rec.response ? 'match' AND (rec.response->>'match')::boolean = COALESCE(rec.pair_is_match, false) THEN
        n_correct := n_correct + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 1, is_correct = true WHERE id = rec.id;
      ELSE
        n_wrong := n_wrong + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 0, is_correct = false WHERE id = rec.id;
      END IF;$a$,
$b$      n_total := n_total + 1;
      IF NOT (rec.response ? 'match') OR jsonb_typeof(rec.response->'match') <> 'boolean' THEN
        n_skipped := n_skipped + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 0, is_correct = NULL WHERE id = rec.id;
      ELSIF (rec.response->>'match')::boolean = COALESCE(rec.pair_is_match, false) THEN
        n_correct := n_correct + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 1, is_correct = true WHERE id = rec.id;
      ELSE
        n_wrong := n_wrong + 1;
        UPDATE public.cbt_attempt_items SET marks_awarded = 0, is_correct = false WHERE id = rec.id;
      END IF;$b$);
  src := replace(src, $a$met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'total', n_total);$a$,
                      $b$met := met || jsonb_build_object('correct', n_correct, 'wrong', n_wrong, 'skipped', n_skipped, 'total', n_total);$b$);
  src := replace(src, $a$n_correct int := 0; n_wrong int := 0; n_total int := 0;$a$, $b$n_correct int := 0; n_wrong int := 0; n_skipped int := 0; n_total int := 0;$b$);
  IF position('n_skipped := n_skipped + 1' in src) = 0 OR position('''skipped'', n_skipped' in src) = 0 THEN
    RAISE EXCEPTION 'cbt_score_section patch did not apply';
  END IF;
  EXECUTE src;
END $do$;

-- ---------- AI grading queue: enqueue on insert ----------
CREATE OR REPLACE FUNCTION public.cbt_kick_ai_grader() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  PERFORM net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/cbt-ai-grade',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-scheduler-secret', (SELECT secret_value FROM public.app_scheduler_secrets WHERE name='internal_cron')),
    body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN NULL; -- the minute sweep picks it up
END $f$;
REVOKE ALL ON FUNCTION public.cbt_kick_ai_grader() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cbt_written_eval_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  PERFORM public.cbt_kick_ai_grader();
  RETURN NULL;
END $f$;
DROP TRIGGER IF EXISTS trg_cbt_written_eval_enqueue ON public.cbt_written_evaluations;
CREATE TRIGGER trg_cbt_written_eval_enqueue AFTER INSERT ON public.cbt_written_evaluations
  FOR EACH STATEMENT EXECUTE FUNCTION public.cbt_written_eval_enqueue();

-- ---------- notice to graders: one per attempt ----------
CREATE OR REPLACE FUNCTION public.cbt_notify_graders(p_attempt_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE n int := 0;
BEGIN
  INSERT INTO public.cbt_grading_notices(attempt_id) VALUES (p_attempt_id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO public.hr_notifications (user_id, type, title, message, link)
  SELECT u.id, 'quiz_grading', 'Written answers need a check',
         'A written test answer needs a quick check in Quiz → Grading.', '/hrms/quiz?view=grading'
    FROM public.users u WHERE public.cbt_can_evaluate(u.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.cbt_notify_graders(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- claim work (service only) ----------
CREATE OR REPLACE FUNCTION public.cbt_ai_claim(p_limit int DEFAULT 5) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE st public.cbt_settings; used int; room int; out jsonb := '[]'::jsonb; r record;
BEGIN
  SELECT * INTO st FROM public.cbt_settings WHERE id;
  -- reclaim work stuck in processing
  UPDATE public.cbt_written_evaluations SET ai_status='queued', ai_next_at=now()
   WHERE ai_status='processing' AND updated_at < now() - interval '10 minutes' AND total IS NULL;

  IF NOT st.ai_grading_enabled THEN
    FOR r IN UPDATE public.cbt_written_evaluations SET ai_status='unavailable', ai_last_error='AI grading is turned off'
              WHERE ai_status='queued' AND total IS NULL RETURNING id LOOP
      PERFORM public.cbt_ai_route_notice(r.id);
    END LOOP;
    RETURN out;
  END IF;

  SELECT count(*) INTO used FROM public.cbt_ai_grading_log
   WHERE outcome IN ('ok','invalid') AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
  room := GREATEST(0, st.ai_daily_cap - used);
  IF room = 0 THEN
    FOR r IN UPDATE public.cbt_written_evaluations SET ai_status='unavailable', ai_last_error='Daily AI grading limit reached'
              WHERE ai_status='queued' AND total IS NULL RETURNING id LOOP
      PERFORM public.cbt_ai_route_notice(r.id);
    END LOOP;
    RETURN out;
  END IF;

  FOR r IN
    UPDATE public.cbt_written_evaluations e SET ai_status='processing', ai_tries = ai_tries + 1, updated_at = now()
     WHERE e.id IN (SELECT id FROM public.cbt_written_evaluations
                     WHERE ai_status='queued' AND total IS NULL AND ai_next_at <= now()
                     ORDER BY created_at LIMIT LEAST(p_limit, room) FOR UPDATE SKIP LOCKED)
    RETURNING e.id, e.attempt_item_id, e.ai_tries
  LOOP
    out := out || (
      SELECT jsonb_build_object('evaluation_id', r.id, 'tries', r.ai_tries,
        'prompt', qv.content->>'prompt', 'scenario', qv.content->>'scenario',
        'rubric', k.rubric, 'min_words', cfg->>'min_words', 'max_words', cfg->>'max_words',
        'answer', COALESCE(i.response->>'text',''))
        FROM public.cbt_attempt_items i
        JOIN public.cbt_question_versions qv ON qv.id = i.question_version_id
        LEFT JOIN public.cbt_question_keys k ON k.question_version_id = qv.id
        CROSS JOIN LATERAL (SELECT public.cbt_section_config(i.attempt_section_id) cfg) c
       WHERE i.id = r.attempt_item_id);
  END LOOP;
  RETURN out;
END $f$;

-- routes an evaluation to Needs a check and sends the one per-attempt notice
CREATE OR REPLACE FUNCTION public.cbt_ai_route_notice(p_eval_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE aid uuid;
BEGIN
  SELECT s.attempt_id INTO aid FROM public.cbt_written_evaluations e
    JOIN public.cbt_attempt_items i ON i.id = e.attempt_item_id
    JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id WHERE e.id = p_eval_id;
  IF aid IS NOT NULL THEN PERFORM public.cbt_notify_graders(aid); END IF;
END $f$;

-- projected attempt total with the current section scores (same formula as cbt_finalize_attempt)
CREATE OR REPLACE FUNCTION public.cbt_projected_total(p_attempt_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT CASE WHEN COALESCE(SUM(w),0)=0 THEN 0 ELSE round((SUM(sc*w)/SUM(w))::numeric,1) END
    FROM (SELECT COALESCE(s.normalized_score,0) sc, COALESCE((public.cbt_section_config(s.id)->>'weight')::numeric,0) w
            FROM public.cbt_attempt_sections s WHERE s.attempt_id = p_attempt_id) x
$f$;

-- ---------- record an AI outcome (service only) ----------
-- p_result is validated by the worker; grades are stored out of 20 everywhere (AI total scaled from the guide's max_marks).
CREATE OR REPLACE FUNCTION public.cbt_ai_record(p_eval_id uuid, p_outcome text, p_model text, p_result jsonb, p_error text, p_http int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE e public.cbt_written_evaluations; st public.cbt_settings; sec_id uuid; att public.cbt_attempts; r_cut jsonb;
  t20 numeric; conf numeric; flags jsonb; projected numeric; margin numeric; reason text := NULL; cfg jsonb; sec_norm numeric;
  backoff interval;
BEGIN
  SELECT * INTO e FROM public.cbt_written_evaluations WHERE id = p_eval_id FOR UPDATE;
  IF e.id IS NULL THEN RETURN jsonb_build_object('route','missing'); END IF;
  SELECT * INTO st FROM public.cbt_settings WHERE id;
  INSERT INTO public.cbt_ai_grading_log(evaluation_id, model, outcome, http_status) VALUES (p_eval_id, p_model, p_outcome, p_http);

  IF e.total IS NOT NULL THEN  -- a person graded it meanwhile: keep theirs, store the AI view only
    UPDATE public.cbt_written_evaluations SET ai_result = COALESCE(p_result, ai_result), ai_model = p_model, ai_graded_at = now(),
      ai_status = CASE WHEN p_outcome='ok' THEN 'suggested' ELSE 'unavailable' END WHERE id = e.id;
    RETURN jsonb_build_object('route','already_graded');
  END IF;

  IF p_outcome = 'retry' AND e.ai_tries < 4 THEN
    PERFORM public.cbt_arm_ai_retry();
    backoff := (power(2, e.ai_tries) * 30 || ' seconds')::interval;
    UPDATE public.cbt_written_evaluations SET ai_status='queued', ai_next_at = now() + backoff, ai_last_error = p_error, ai_model = p_model WHERE id = e.id;
    RETURN jsonb_build_object('route','retry','next_in_seconds', extract(epoch from backoff));
  END IF;

  IF p_outcome <> 'ok' THEN
    UPDATE public.cbt_written_evaluations SET ai_status='unavailable', ai_last_error = COALESCE(p_error,'AI unavailable'),
      ai_model = p_model, ai_graded_at = now(), ai_route_reason = 'AI unavailable' WHERE id = e.id;
    PERFORM public.cbt_ai_route_notice(e.id);
    RETURN jsonb_build_object('route','needs_check','reason','AI unavailable');
  END IF;

  t20 := round((p_result->>'total_20')::numeric * 2) / 2;
  conf := (p_result->>'confidence')::numeric;
  flags := COALESCE(p_result->'flags','[]'::jsonb);
  IF t20 IS NULL OR t20 < 0 OR t20 > 20 OR conf IS NULL THEN
    UPDATE public.cbt_written_evaluations SET ai_status='unavailable', ai_last_error='AI result out of range', ai_result=p_result, ai_model=p_model,
      ai_graded_at=now(), ai_route_reason='AI unavailable' WHERE id = e.id;
    PERFORM public.cbt_ai_route_notice(e.id);
    RETURN jsonb_build_object('route','needs_check','reason','AI unavailable');
  END IF;

  SELECT i.attempt_section_id INTO sec_id FROM public.cbt_attempt_items i WHERE i.id = e.attempt_item_id;
  SELECT a.* INTO att FROM public.cbt_attempts a JOIN public.cbt_attempt_sections s ON s.attempt_id = a.id WHERE s.id = sec_id;
  cfg := public.cbt_section_config(sec_id);

  IF jsonb_array_length(flags) > 0 THEN reason := 'Flagged: ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(flags) x);
  ELSIF conf < st.ai_confidence_threshold THEN reason := format('Low confidence (%s)', round(conf,2));
  END IF;

  -- tentatively apply to project the attempt total (rolled back below if routed to a check)
  UPDATE public.cbt_written_evaluations SET total = t20 WHERE id = e.id;
  PERFORM public.cbt_score_section(sec_id);
  IF reason IS NULL THEN
    margin := st.ai_borderline_margin;
    projected := public.cbt_projected_total(att.id);
    r_cut := att.blueprint_snapshot->'role';
    IF abs(projected - (r_cut->>'shortlist_cutoff')::numeric) < margin THEN
      reason := format('Borderline: total %s is within %s of the shortlist cut-off %s', projected, margin, r_cut->>'shortlist_cutoff');
    ELSIF abs(projected - (r_cut->>'hold_cutoff')::numeric) < margin THEN
      reason := format('Borderline: total %s is within %s of the hold cut-off %s', projected, margin, r_cut->>'hold_cutoff');
    ELSIF cfg->>'gate_min_score' IS NOT NULL THEN
      SELECT normalized_score INTO sec_norm FROM public.cbt_attempt_sections WHERE id = sec_id;
      IF abs(sec_norm - (cfg->>'gate_min_score')::numeric) < margin * 100 / 20 THEN
        reason := format('Borderline: written score %s is near its pass mark %s', sec_norm, cfg->>'gate_min_score');
      END IF;
    END IF;
  END IF;

  IF reason IS NULL THEN
    UPDATE public.cbt_written_evaluations SET graded_by_kind='ai', evaluator_id=NULL, ai_status='applied', ai_suggested_total=t20,
      ai_result=p_result, ai_model=p_model, ai_graded_at=now(), ai_route_reason=NULL, ai_last_error=NULL, updated_at=now() WHERE id = e.id;
    PERFORM public.cbt_finalize_attempt(att.id);
    INSERT INTO public.cbt_audit_log(actor_id, entity, entity_id, action, after, reason)
    VALUES (NULL, 'cbt_written_evaluations', e.id, 'ai_grade_applied', jsonb_build_object('total', t20, 'model', p_model, 'confidence', conf), 'AI grade applied automatically');
    RETURN jsonb_build_object('route','applied','total_20',t20);
  END IF;

  UPDATE public.cbt_written_evaluations SET total = NULL, ai_status='suggested', ai_suggested_total=t20, ai_result=p_result, ai_model=p_model,
    ai_graded_at=now(), ai_route_reason=reason, ai_last_error=NULL WHERE id = e.id;
  PERFORM public.cbt_score_section(sec_id);
  PERFORM public.cbt_finalize_attempt(att.id);
  PERFORM public.cbt_ai_route_notice(e.id);
  RETURN jsonb_build_object('route','needs_check','reason',reason,'total_20',t20);
END $f$;

REVOKE ALL ON FUNCTION public.cbt_ai_claim(int), public.cbt_ai_record(uuid,text,text,jsonb,text,int), public.cbt_ai_route_notice(uuid), public.cbt_projected_total(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_ai_claim(int), public.cbt_ai_record(uuid,text,text,jsonb,text,int) TO service_role;

-- ---------- HR grade (extended; 3-arg calls still work) ----------
DROP FUNCTION IF EXISTS public.cbt_grade_written_response(uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.cbt_grade_written_response(p_evaluation_id uuid, p_total numeric, p_comments text DEFAULT NULL, p_accept_ai boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_item_id uuid; v_section_id uuid; v_attempt_id uuid; old public.cbt_written_evaluations; v_total numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cbt_can_evaluate(auth.uid()) THEN RAISE EXCEPTION 'Quiz evaluation permission required'; END IF;
  SELECT * INTO old FROM public.cbt_written_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF old.id IS NULL THEN RAISE EXCEPTION 'Written response not found'; END IF;
  v_total := CASE WHEN p_accept_ai THEN old.ai_suggested_total ELSE p_total END;
  IF v_total IS NULL OR v_total < 0 OR v_total > 20 THEN RAISE EXCEPTION 'Written score must be between 0 and 20'; END IF;
  IF v_total * 2 <> round(v_total * 2) THEN RAISE EXCEPTION 'Use steps of 0.5'; END IF;
  SELECT i.id, i.attempt_section_id, s.attempt_id INTO v_item_id, v_section_id, v_attempt_id
    FROM public.cbt_attempt_items i JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id WHERE i.id = old.attempt_item_id;

  UPDATE public.cbt_written_evaluations
     SET evaluator_id = auth.uid(), total = v_total, graded_by_kind = 'human',
         comments = NULLIF(btrim(COALESCE(p_comments,'')),''), updated_at = now()
   WHERE id = p_evaluation_id;
  PERFORM public.cbt_score_section(v_section_id);
  PERFORM public.cbt_finalize_attempt(v_attempt_id);
  INSERT INTO public.cbt_audit_log(actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), 'cbt_written_evaluations', p_evaluation_id,
          CASE WHEN p_accept_ai THEN 'accept_ai_grade' ELSE 'grade_written_response' END,
          jsonb_build_object('total', old.total, 'graded_by', old.graded_by_kind, 'ai_suggested_total', old.ai_suggested_total),
          jsonb_build_object('total', v_total, 'graded_by', 'human'),
          CASE WHEN p_accept_ai THEN 'AI grade accepted by HR' ELSE 'Written response graded' END);
END $function$;
REVOKE ALL ON FUNCTION public.cbt_grade_written_response(uuid, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_grade_written_response(uuid, numeric, text, boolean) TO authenticated;

-- ---------- blind grading read ----------
CREATE OR REPLACE FUNCTION public.cbt_grading_queue(p_tab text DEFAULT 'needs_check') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT public.cbt_can_evaluate(auth.uid()) THEN RAISE EXCEPTION 'Quiz evaluation permission required'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY (row->>'created_at')) FROM (
      SELECT jsonb_build_object(
        'id', e.id, 'created_at', e.created_at, 'updated_at', e.updated_at,
        'state', CASE WHEN e.total IS NOT NULL AND e.graded_by_kind='ai' THEN 'ai_graded'
                      WHEN e.total IS NOT NULL THEN 'human' WHEN e.ai_status IN ('queued','processing') THEN 'ai_pending' ELSE 'needs_check' END,
        'prompt', qv.content->>'prompt', 'scenario', qv.content->>'scenario', 'rubric', k.rubric,
        'min_words', public.cbt_section_config(i.attempt_section_id)->>'min_words',
        'max_words', public.cbt_section_config(i.attempt_section_id)->>'max_words',
        'answer', COALESCE(i.response->>'text',''), 'total', e.total, 'comments', e.comments,
        'graded_by_kind', e.graded_by_kind, 'ai_status', e.ai_status, 'ai_model', e.ai_model, 'ai_result', e.ai_result,
        'ai_suggested_total', e.ai_suggested_total, 'ai_route_reason', e.ai_route_reason, 'ai_last_error', e.ai_last_error,
        'ai_graded_at', e.ai_graded_at) AS row
        FROM public.cbt_written_evaluations e
        JOIN public.cbt_attempt_items i ON i.id = e.attempt_item_id
        JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
        JOIN public.cbt_attempts a ON a.id = s.attempt_id
        JOIN public.cbt_drives d ON d.id = a.drive_id
        LEFT JOIN public.cbt_question_versions qv ON qv.id = i.question_version_id
        LEFT JOIN public.cbt_question_keys k ON k.question_version_id = qv.id
       WHERE NOT COALESCE(d.is_try_run,false)
         AND CASE p_tab WHEN 'needs_check' THEN e.total IS NULL
                        WHEN 'ai_graded' THEN e.total IS NOT NULL AND e.graded_by_kind='ai'
                        WHEN 'human' THEN e.total IS NOT NULL AND COALESCE(e.graded_by_kind,'human')='human'
                        ELSE true END
       ORDER BY e.created_at LIMIT 200) q), '[]'::jsonb);
END $f$;

CREATE OR REPLACE FUNCTION public.cbt_grading_counts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT public.cbt_can_evaluate(auth.uid()) THEN RAISE EXCEPTION 'Quiz evaluation permission required'; END IF;
  RETURN (SELECT jsonb_build_object(
      'needs_check', count(*) FILTER (WHERE e.total IS NULL AND e.ai_status NOT IN ('queued','processing')),
      'ai_pending', count(*) FILTER (WHERE e.total IS NULL AND e.ai_status IN ('queued','processing')),
      'ai_graded', count(*) FILTER (WHERE e.total IS NOT NULL AND e.graded_by_kind='ai'),
      'human', count(*) FILTER (WHERE e.total IS NOT NULL AND COALESCE(e.graded_by_kind,'human')='human'),
      'ai_this_month', (SELECT count(*) FROM public.cbt_ai_grading_log l WHERE l.outcome IN ('ok','invalid')
          AND date_trunc('month', l.created_at AT TIME ZONE 'Asia/Kolkata') = date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')),
      'ai_today', (SELECT count(*) FROM public.cbt_ai_grading_log l WHERE l.outcome IN ('ok','invalid')
          AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date))
    FROM public.cbt_written_evaluations e
    JOIN public.cbt_attempt_items i ON i.id = e.attempt_item_id
    JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
    JOIN public.cbt_attempts a ON a.id = s.attempt_id
    JOIN public.cbt_drives d ON d.id = a.drive_id
   WHERE NOT COALESCE(d.is_try_run,false));
END $f$;
REVOKE ALL ON FUNCTION public.cbt_grading_queue(text), public.cbt_grading_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_grading_queue(text), public.cbt_grading_counts() TO authenticated;

-- ---------- settings: AI grading fields ----------
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.cbt_update_settings(jsonb)'::regprocedure);
  src := replace(src, $a$  IF length(n.company_name) > 120$a$,
$b$  IF p ? 'ai_grading_enabled' THEN n.ai_grading_enabled := (p->>'ai_grading_enabled')::boolean; END IF;
  IF p ? 'ai_confidence_threshold' THEN n.ai_confidence_threshold := (p->>'ai_confidence_threshold')::numeric; END IF;
  IF p ? 'ai_borderline_margin' THEN n.ai_borderline_margin := (p->>'ai_borderline_margin')::numeric; END IF;
  IF p ? 'ai_daily_cap' THEN n.ai_daily_cap := (p->>'ai_daily_cap')::int; END IF;
  IF n.ai_confidence_threshold NOT BETWEEN 0.5 AND 1 THEN RAISE EXCEPTION 'Confidence threshold must be 0.5 to 1'; END IF;
  IF n.ai_borderline_margin NOT BETWEEN 0 AND 20 THEN RAISE EXCEPTION 'Borderline margin must be 0 to 20 points'; END IF;
  IF n.ai_daily_cap NOT BETWEEN 0 AND 5000 THEN RAISE EXCEPTION 'Daily AI cap must be 0 to 5000'; END IF;
  IF length(n.company_name) > 120$b$);
  src := replace(src, $a$typing_practice_passage = n.typing_practice_passage, updated_at = now()$a$,
    $b$typing_practice_passage = n.typing_practice_passage, ai_grading_enabled = n.ai_grading_enabled,
    ai_confidence_threshold = n.ai_confidence_threshold, ai_borderline_margin = n.ai_borderline_margin, ai_daily_cap = n.ai_daily_cap, updated_at = now()$b$);
  src := replace(src, 'invalid_text_representation OR numeric_value_out_of_range', 'invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value');
  IF position('ai_daily_cap = n.ai_daily_cap' in src) = 0 THEN RAISE EXCEPTION 'settings patch failed'; END IF;
  EXECUTE src;
END $do$;

-- retries: a one-minute retry job exists only while a retry is waiting; the worker removes it once the queue drains
CREATE OR REPLACE FUNCTION public.cbt_arm_ai_retry() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quiz-ai-grading-retry') THEN
    PERFORM cron.schedule('quiz-ai-grading-retry', '* * * * *', 'SELECT public.cbt_kick_ai_grader()');
  END IF;
END $f$;
CREATE OR REPLACE FUNCTION public.cbt_disarm_ai_retry() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cbt_written_evaluations WHERE total IS NULL AND ai_status IN ('queued','processing'))
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quiz-ai-grading-retry') THEN
    PERFORM cron.unschedule('quiz-ai-grading-retry');
  END IF;
END $f$;
REVOKE ALL ON FUNCTION public.cbt_arm_ai_retry(), public.cbt_disarm_ai_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_disarm_ai_retry() TO service_role;
