CREATE SEQUENCE IF NOT EXISTS public.cbt_attempt_ref_seq START 1;

CREATE OR REPLACE FUNCTION public.cbt_next_attempt_ref()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CBT-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMM') || '-' ||
         lpad(nextval('public.cbt_attempt_ref_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.cbt_bump_served(p_question_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cbt_questions
     SET times_served = COALESCE(times_served, 0) + 1
   WHERE id = p_question_id;
$$;

REVOKE ALL ON FUNCTION public.cbt_next_attempt_ref() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cbt_bump_served(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_next_attempt_ref() TO service_role;
GRANT EXECUTE ON FUNCTION public.cbt_bump_served(uuid) TO service_role;