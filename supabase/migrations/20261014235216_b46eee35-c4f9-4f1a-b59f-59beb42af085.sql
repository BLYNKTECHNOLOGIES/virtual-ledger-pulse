DO $mig$
DECLARE d text; n text;
  PROCEDURE_DUMMY int;
BEGIN
  -- §0.9 borderline uses the role's current cut-offs (same as cbt_finalize_attempt)
  d := pg_get_functiondef('public.cbt_ai_record(uuid,text,text,jsonb,text,integer)'::regprocedure);
  n := replace(d, $$r_cut := att.blueprint_snapshot->'role';$$,
    $$SELECT jsonb_build_object('shortlist_cutoff', jr.shortlist_cutoff, 'hold_cutoff', jr.hold_cutoff) INTO r_cut FROM public.cbt_job_roles jr WHERE jr.id = att.job_role_id;$$);
  IF n = d THEN RAISE EXCEPTION 'cbt_ai_record: cut-off line not found'; END IF;
  EXECUTE n;

  -- §0.3 word limits: section's when set, else the question's own
  d := pg_get_functiondef('public.cbt_ai_claim(integer)'::regprocedure);
  n := replace(d, $$'min_words', cfg->>'min_words', 'max_words', cfg->>'max_words',$$,
    $$'min_words', COALESCE(NULLIF(cfg->>'min_words',''), NULLIF(qv.content->>'min_words','')), 'max_words', COALESCE(NULLIF(cfg->>'max_words',''), NULLIF(qv.content->>'max_words','')),$$);
  IF n = d THEN RAISE EXCEPTION 'cbt_ai_claim: limits not found'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.cbt_grading_queue(text)'::regprocedure);
  n := replace(d, $$'min_words', public.cbt_section_config(i.attempt_section_id)->>'min_words',
        'max_words', public.cbt_section_config(i.attempt_section_id)->>'max_words',$$,
    $$'min_words', COALESCE(NULLIF(public.cbt_section_config(i.attempt_section_id)->>'min_words',''), NULLIF(qv.content->>'min_words','')),
        'max_words', COALESCE(NULLIF(public.cbt_section_config(i.attempt_section_id)->>'max_words',''), NULLIF(qv.content->>'max_words','')),$$);
  IF n = d THEN RAISE EXCEPTION 'cbt_grading_queue: limits not found'; END IF;
  -- §0.6 graded tabs newest first; Needs a check oldest first
  d := n;
  n := replace(d, $$jsonb_agg(row ORDER BY (row->>'created_at'))$$,
    $$jsonb_agg(row ORDER BY CASE WHEN p_tab = 'needs_check' THEN (row->>'created_at')::timestamptz END ASC, (row->>'created_at')::timestamptz DESC)$$);
  n := replace(n, $$ORDER BY e.created_at LIMIT 200$$,
    $$ORDER BY CASE WHEN p_tab = 'needs_check' THEN e.created_at END ASC, e.created_at DESC LIMIT 200$$);
  IF n = d THEN RAISE EXCEPTION 'cbt_grading_queue: order not found'; END IF;
  EXECUTE n;

  -- §0.8 active users only
  d := pg_get_functiondef('public.cbt_notify_graders(uuid)'::regprocedure);
  n := replace(d, $$FROM public.users u WHERE public.cbt_can_evaluate(u.id);$$,
    $$FROM public.users u WHERE upper(COALESCE(u.status,'')) = 'ACTIVE' AND public.cbt_can_evaluate(u.id);$$);
  IF n = d THEN RAISE EXCEPTION 'cbt_notify_graders: filter not found'; END IF;
  EXECUTE n;
END $mig$;

-- §0.2 no grader notices for try runs (graders cannot see them)
CREATE OR REPLACE FUNCTION public.cbt_ai_route_notice(p_eval_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE aid uuid; try boolean;
BEGIN
  SELECT s.attempt_id, COALESCE(d.is_try_run,false) INTO aid, try FROM public.cbt_written_evaluations e
    JOIN public.cbt_attempt_items i ON i.id = e.attempt_item_id
    JOIN public.cbt_attempt_sections s ON s.id = i.attempt_section_id
    JOIN public.cbt_attempts a ON a.id = s.attempt_id
    JOIN public.cbt_drives d ON d.id = a.drive_id
   WHERE e.id = p_eval_id;
  IF aid IS NOT NULL AND NOT try THEN PERFORM public.cbt_notify_graders(aid); END IF;
END $function$;

-- §0.1 the existing minute sweep re-kicks the grader when work is due or stuck
CREATE OR REPLACE FUNCTION public.cbt_sweep_expired()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int := 0; r record; BEGIN
  FOR r IN SELECT a.id FROM public.cbt_attempts a
            WHERE a.status IN ('registered','in_progress') ORDER BY a.id LIMIT 500 LOOP
    PERFORM 1 FROM public.cbt_attempts WHERE id = r.id FOR UPDATE SKIP LOCKED;
    IF FOUND THEN
      PERFORM public.cbt_sweep_attempt(r.id); n := n + 1;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.cbt_written_evaluations
              WHERE total IS NULL AND ((ai_status = 'queued' AND ai_next_at <= now())
                 OR (ai_status = 'processing' AND updated_at < now() - interval '10 minutes'))) THEN
    PERFORM public.cbt_kick_ai_grader();
  END IF;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.cbt_kick_ai_grader()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/cbt-ai-grade',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-scheduler-secret', (SELECT secret_value FROM public.app_scheduler_secrets WHERE name='internal_cron')),
    body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN NULL; -- cbt_sweep_expired re-kicks every minute while work is queued or stuck
END $function$;

-- §0.2 try-run result shows each written answer's AI grade, flags and reasons
CREATE OR REPLACE FUNCTION public.cbt_try_runs(p_role_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN NOT public.cbt_can_view() THEN NULL ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'public_ref', a.public_ref, 'person', c.full_name, 'status', a.status,
      'total_score', a.total_score, 'decision', a.decision, 'created_at', a.created_at, 'access_code', d.access_code,
      'removed_after', d.created_at + interval '3 days',
      'written', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'prompt', qv.content->>'prompt', 'answer', COALESCE(i.response->>'text',''),
          'total', e.total, 'graded_by_kind', e.graded_by_kind, 'ai_status', e.ai_status,
          'ai_suggested_total', e.ai_suggested_total, 'ai_route_reason', e.ai_route_reason, 'ai_last_error', e.ai_last_error,
          'flags', COALESCE(e.ai_result->'flags','[]'::jsonb), 'points', COALESCE(e.ai_result->'points','[]'::jsonb),
          'summary', e.ai_result->>'summary', 'confidence', e.ai_result->'confidence') ORDER BY s.order_index, i.display_order)
        FROM public.cbt_attempt_sections s
        JOIN public.cbt_attempt_items i ON i.attempt_section_id = s.id
        JOIN public.cbt_written_evaluations e ON e.attempt_item_id = i.id
        LEFT JOIN public.cbt_question_versions qv ON qv.id = i.question_version_id
       WHERE s.attempt_id = a.id), '[]'::jsonb)) ORDER BY a.created_at DESC)
    FROM public.cbt_attempts a JOIN public.cbt_drives d ON d.id = a.drive_id AND d.is_try_run
    LEFT JOIN public.cbt_candidates c ON c.id = a.candidate_id
    WHERE a.job_role_id = p_role_id), '[]'::jsonb) END
$function$;