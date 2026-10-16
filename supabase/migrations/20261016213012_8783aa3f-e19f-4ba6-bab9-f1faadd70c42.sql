
CREATE OR REPLACE FUNCTION public.hr_wf_refresh_open_requirements()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v jsonb;
BEGIN
  WITH c AS (
    SELECT r.id FROM public.hr_hiring_requirements r
    WHERE r.status IN ('approved','recruitment_active','partially_fulfilled')
    FOR UPDATE SKIP LOCKED
  ), rp AS MATERIALIZED (SELECT * FROM public.hr_wf_requirement_people(NULL))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'no', r.requirement_no, 'filled', coalesce(rp.joined_hc, 0),
      'lft', greatest(r.number_required - coalesce(rp.joined_hc,0) - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0),
      'status', CASE WHEN coalesce(rp.joined_hc,0) >= r.number_required THEN 'fulfilled'
                     WHEN coalesce(rp.joined_hc,0) > 0 THEN 'partially_fulfilled'
                     WHEN EXISTS (SELECT 1 FROM public.ats_jobs aj
                                   WHERE aj.status IN ('open','paused')
                                     AND r.id = ANY(ARRAY(SELECT public.ats_job_requirement_ids(aj.id)))) THEN 'recruitment_active'
                     WHEN r.status = 'partially_fulfilled' THEN 'approved'
                     ELSE r.status END)), '[]'::jsonb)
    INTO v
  FROM c JOIN public.hr_hiring_requirements r ON r.id = c.id LEFT JOIN rp ON rp.requirement_id = r.id;

  UPDATE public.hr_hiring_requirements h SET positions_filled = x.filled, status = x.status
    FROM jsonb_to_recordset(v) AS x(id uuid, filled int, status text)
   WHERE h.id = x.id AND (h.positions_filled IS DISTINCT FROM x.filled OR h.status IS DISTINCT FROM x.status);

  UPDATE public.ats_jobs t SET status = 'closed', closed_reason = 'Hiring requirement fulfilled'
   WHERE t.id IN (SELECT j.id FROM public.ats_jobs j
                   WHERE j.status IN ('open','paused')
                     AND EXISTS (SELECT 1 FROM public.ats_job_requirement_ids(j.id))
                     AND NOT EXISTS (SELECT 1 FROM public.hr_hiring_requirements r2
                                      WHERE r2.id = ANY(ARRAY(SELECT public.ats_job_requirement_ids(j.id)))
                                        AND r2.status <> 'fulfilled')
                   FOR UPDATE SKIP LOCKED);

  WITH j AS (
    SELECT aj.id, aj.openings AS old_o, greatest(sum(x.lft), 1)::int AS new_o, sum(x.lft) AS lft,
           string_agg(x.no, ' + ' ORDER BY x.no) AS no
    FROM public.ats_jobs aj
    JOIN LATERAL (
      SELECT x.no, x.lft FROM jsonb_to_recordset(v) AS x(id uuid, no text, lft int, status text)
      WHERE x.status <> 'fulfilled' AND x.id = ANY(ARRAY(SELECT public.ats_job_requirement_ids(aj.id)))
    ) x ON true
    WHERE aj.status IN ('open','paused')
    GROUP BY aj.id, aj.openings
    HAVING aj.openings IS DISTINCT FROM greatest(sum(x.lft), 1)::int
  ), u AS (UPDATE public.ats_jobs t SET openings = j.new_o FROM j WHERE t.id = j.id RETURNING t.id)
  INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
  SELECT j.id, 'job_openings', format('Openings %s → %s to match %s (%s still to find)', j.old_o, j.new_o, j.no, j.lft),
         jsonb_build_object('requirement_id', NULL, 'from', j.old_o, 'to', j.new_o, 'still_to_find', j.lft), 'System'
  FROM j JOIN u ON u.id = j.id;
END $function$;
