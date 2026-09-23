CREATE OR REPLACE FUNCTION public.cbt_question_bank_analytics()
RETURNS TABLE (
  question_id uuid,
  type text,
  category_tag text,
  difficulty text,
  status text,
  times_served integer,
  applicable_role_codes text[],
  created_at timestamptz,
  version_no integer,
  prompt text,
  marks numeric,
  options jsonb,
  correct_option_id text,
  numeric_answer numeric,
  explanation text,
  served_items bigint,
  answered_items bigint,
  correct_items bigint,
  wrong_items bigint,
  skipped_items bigint,
  accuracy numeric,
  avg_marks numeric,
  last_served_at timestamptz,
  option_tally jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ver AS (
    SELECT q.id AS question_id, v.id AS version_id, v.version_no, v.content
    FROM public.cbt_questions q
    LEFT JOIN public.cbt_question_versions v ON v.id = q.current_version_id
  ),
  item_stats AS (
    SELECT v.question_id,
           count(*) AS served_items,
           count(*) FILTER (WHERE i.response IS NOT NULL) AS answered_items,
           count(*) FILTER (WHERE i.is_correct IS TRUE) AS correct_items,
           count(*) FILTER (WHERE i.is_correct IS FALSE AND i.response IS NOT NULL) AS wrong_items,
           count(*) FILTER (WHERE i.response IS NULL) AS skipped_items,
           avg(i.marks_awarded) AS avg_marks,
           max(coalesce(i.answered_at, i.created_at)) AS last_served_at
    FROM public.cbt_attempt_items i
    JOIN public.cbt_question_versions v ON v.id = i.question_version_id
    GROUP BY v.question_id
  ),
  opt AS (
    SELECT v.question_id, i.response->>'option_id' AS option_id, count(*) AS picks
    FROM public.cbt_attempt_items i
    JOIN public.cbt_question_versions v ON v.id = i.question_version_id
    WHERE i.response ? 'option_id'
    GROUP BY v.question_id, i.response->>'option_id'
  ),
  opt_agg AS (
    SELECT question_id, jsonb_object_agg(option_id, picks) AS option_tally
    FROM opt GROUP BY question_id
  )
  SELECT q.id,
         q.type::text,
         q.category_tag,
         q.difficulty::text,
         q.status::text,
         q.times_served,
         q.applicable_role_codes,
         q.created_at,
         ver.version_no,
         ver.content->>'prompt',
         nullif(ver.content->>'marks','')::numeric,
         ver.content->'options',
         k.correct_option_id,
         k.numeric_answer,
         k.explanation,
         coalesce(s.served_items, 0),
         coalesce(s.answered_items, 0),
         coalesce(s.correct_items, 0),
         coalesce(s.wrong_items, 0),
         coalesce(s.skipped_items, 0),
         CASE WHEN coalesce(s.answered_items,0) > 0
           THEN round(100.0 * s.correct_items / s.answered_items, 1) END,
         round(coalesce(s.avg_marks, 0), 2),
         s.last_served_at,
         coalesce(o.option_tally, '{}'::jsonb)
  FROM public.cbt_questions q
  LEFT JOIN ver ON ver.question_id = q.id
  LEFT JOIN public.cbt_question_keys k ON k.question_version_id = q.current_version_id
  LEFT JOIN item_stats s ON s.question_id = q.id
  LEFT JOIN opt_agg o ON o.question_id = q.id
  WHERE public.cbt_can_view()
$$;

REVOKE ALL ON FUNCTION public.cbt_question_bank_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cbt_question_bank_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_question_bank_analytics() TO service_role;