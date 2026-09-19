DO $$
DECLARE
  v_attempt uuid;
  v_candidate uuid;
BEGIN
  SELECT id, candidate_id INTO v_attempt, v_candidate FROM public.cbt_attempts WHERE public_ref = 'CBT-2609-000019';
  IF v_attempt IS NULL THEN RETURN; END IF;
  DELETE FROM public.cbt_attempts WHERE id = v_attempt;
  DELETE FROM public.cbt_candidates WHERE id = v_candidate;
END $$;