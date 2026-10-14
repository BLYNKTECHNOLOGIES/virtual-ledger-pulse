-- lovable-cron-fallback-reviewed: abandoned/expired candidate attempts have no browser left to trigger the sweep; owner asked for a per-minute sweep; idle cost is one partial-index scan
-- QZ1.1: score the five knowledge-skill section types exactly like objective MCQ sections
DO $mig$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.cbt_score_section(uuid)'::regprocedure) INTO def;
  IF position($$ELSIF s.section_type = 'objective' THEN$$ IN def) = 0 THEN
    RAISE EXCEPTION 'cbt_score_section: objective branch not found';
  END IF;
  def := replace(def, $$ELSIF s.section_type = 'objective' THEN$$,
    $$ELSIF s.section_type IN ('objective','logical_reasoning','problem_solving','pattern_recognition','grammar','vocabulary') THEN$$);
  EXECUTE def;
END $mig$;

CREATE INDEX IF NOT EXISTS idx_cbt_attempts_open ON public.cbt_attempts (id)
  WHERE status IN ('registered','in_progress');

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
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.cbt_purge_rate_limits()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int; BEGIN
  DELETE FROM public.cbt_rate_limits WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.cbt_purge_rate_limits() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('quiz-sweep-every-minute','quiz-retention-nightly');
SELECT cron.schedule('quiz-sweep-every-minute', '* * * * *', $$SELECT public.cbt_sweep_expired();$$);
SELECT cron.schedule('quiz-retention-nightly', '0 21 * * *',
  $$SELECT public.cbt_retention_purge(); SELECT public.cbt_purge_rate_limits();$$);