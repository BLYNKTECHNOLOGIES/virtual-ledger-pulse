CREATE OR REPLACE FUNCTION public.hr_wf_refresh_requirement(p_requirement uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_filled int; v_has_job boolean; v_new text; p record; v_left int; jb record;
BEGIN
  IF p_requirement IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_requirement FOR UPDATE;
  IF NOT FOUND OR r.status IN ('draft','pending_approval','rejected','cancelled') THEN RETURN; END IF;
  SELECT * INTO p FROM public.hr_wf_requirement_people(p_requirement) LIMIT 1;
  v_filled := coalesce(p.joined_hc, 0);
  v_has_job := EXISTS (SELECT 1 FROM public.ats_jobs aj WHERE aj.requisition_id = p_requirement AND aj.status IN ('open','paused'));
  v_new := CASE
    WHEN v_filled >= r.number_required THEN 'fulfilled'
    WHEN v_filled > 0 THEN 'partially_fulfilled'
    WHEN v_has_job THEN 'recruitment_active'
    WHEN r.status IN ('fulfilled','partially_fulfilled') THEN 'approved'
    ELSE r.status END;
  UPDATE public.hr_hiring_requirements SET positions_filled = v_filled, status = v_new
   WHERE id = p_requirement AND (positions_filled IS DISTINCT FROM v_filled OR status IS DISTINCT FROM v_new);
  IF v_new = 'fulfilled' THEN
    UPDATE public.ats_jobs SET status = 'closed', closed_reason = 'Hiring requirement fulfilled'
     WHERE requisition_id = p_requirement AND status IN ('open','paused');
  ELSE
    v_left := greatest(r.number_required - v_filled - coalesce(p.selected_hc,0) - coalesce(p.joining_hc,0), 0);
    FOR jb IN SELECT aj.id, aj.openings, aj.job_code FROM public.ats_jobs aj
              WHERE aj.requisition_id = p_requirement AND aj.status IN ('open','paused') AND aj.openings IS DISTINCT FROM greatest(v_left, 1) LOOP
      UPDATE public.ats_jobs SET openings = greatest(v_left, 1) WHERE id = jb.id;
      INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
      VALUES (jb.id, 'job_openings',
        format('Openings %s → %s to match %s (%s still to find)', jb.openings, greatest(v_left, 1), r.requirement_no, v_left),
        jsonb_build_object('requirement_id', r.id, 'from', jb.openings, 'to', greatest(v_left, 1), 'still_to_find', v_left), 'System');
    END LOOP;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_refresh_requirement(uuid) FROM PUBLIC, anon, authenticated;