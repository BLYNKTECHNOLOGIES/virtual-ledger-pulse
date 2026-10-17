-- 1.1 hand-off: SQLERRID is not a PL/pgSQL variable
DO $do$
DECLARE d text := pg_get_functiondef('public.hr_ats_hire_handoff()'::regprocedure); n text;
BEGIN
  n := replace(d, $q$jsonb_build_object('error', SQLERRID)$q$, $q$jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE)$q$);
  IF n = d OR position('SQLERRID' in n) > 0 THEN RAISE EXCEPTION 'WF6: hand-off handler pattern not found'; END IF;
  EXECUTE n;
END $do$;

-- 1.8 budget: job salary range via the link set
DO $do$
DECLARE d text := pg_get_functiondef('public.hr_workforce_budget()'::regprocedure); n text;
BEGIN
  n := replace(d, 'FROM public.ats_jobs j WHERE j.requisition_id = r.id AND',
    'FROM public.ats_jobs j WHERE (j.requisition_id = r.id OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = j.id AND jr.requirement_id = r.id)) AND');
  IF n = d THEN RAISE EXCEPTION 'WF6: budget pattern not found'; END IF;
  EXECUTE n;
END $do$;

-- 1.4 attribution: one requirement per application
CREATE OR REPLACE FUNCTION public.hr_wf_application_requirement(p_job uuid, p_pref text[])
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH j AS (SELECT id, requisition_id FROM public.ats_jobs WHERE id = p_job),
  ps AS (
    SELECT s.id FROM public.hr_shifts s
     WHERE cardinality(coalesce(p_pref, '{}'::text[])) = 1
       AND (s.id::text = btrim(p_pref[1]) OR lower(s.name) = lower(btrim(p_pref[1])))
     ORDER BY (s.id::text = btrim(p_pref[1])) DESC LIMIT 1
  ),
  sr AS (
    SELECT r.id, r.requirement_no, r.staffing_plan_id FROM public.hr_hiring_requirements r
     WHERE r.id IN (SELECT public.ats_job_requirement_ids(p_job))
  )
  SELECT coalesce(
    (SELECT sr.id FROM sr JOIN public.hr_headcount_plans p ON p.id = sr.staffing_plan_id CROSS JOIN ps
      WHERE cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) > 0
        AND public.hr_wf_planning_shift(ps.id) = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))
      ORDER BY (sr.id IS NOT DISTINCT FROM (SELECT requisition_id FROM j)) DESC, sr.requirement_no LIMIT 1),
    (SELECT requisition_id FROM j),
    (SELECT sr.id FROM sr ORDER BY sr.requirement_no LIMIT 1))
$$;
REVOKE ALL ON FUNCTION public.hr_wf_application_requirement(uuid, text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_requirement_people(p_requirement uuid DEFAULT NULL::uuid)
 RETURNS TABLE(requirement_id uuid, pipeline_hc integer, selected_hc integer, joining_hc integer, joined_hc integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH ob AS (
  SELECT op.requirement_id rid,
    count(*) FILTER (WHERE op.state = 'selected')::int sel,
    count(*) FILTER (WHERE op.state = 'joining')::int jn,
    count(*) FILTER (WHERE op.state = 'joined')::int jd
  FROM public.hr_wf_onboarding_people() op
  WHERE op.requirement_id IS NOT NULL AND (p_requirement IS NULL OR op.requirement_id = p_requirement)
  GROUP BY 1
), pl AS (
  SELECT s.rid, count(*)::int n FROM (
    SELECT public.hr_wf_application_requirement(j.id, a.preferred_shifts) rid
    FROM public.ats_jobs j JOIN public.ats_applications a ON a.job_id = j.id
    WHERE j.status IN ('open','paused') AND a.status IN ('active','on_hold')
      AND (p_requirement IS NULL OR j.requisition_id = p_requirement
           OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = j.id AND jr.requirement_id = p_requirement))
  ) s
  WHERE s.rid IS NOT NULL AND (p_requirement IS NULL OR s.rid = p_requirement)
  GROUP BY 1
)
SELECT r.id,
  CASE WHEN r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN coalesce(pl.n, 0) ELSE 0 END,
  coalesce(ob.sel, 0), coalesce(ob.jn, 0), coalesce(ob.jd, 0)
FROM public.hr_hiring_requirements r
LEFT JOIN ob ON ob.rid = r.id
LEFT JOIN pl ON pl.rid = r.id
WHERE p_requirement IS NULL OR r.id = p_requirement
$function$;

-- 1.5 funnel through the link set with the same attribution
CREATE OR REPLACE FUNCTION public.hr_wf_requirement_pipeline_core(p_requirement uuid DEFAULT NULL::uuid)
 RETURNS TABLE(requirement_id uuid, applied integer, new_hc integer, screening integer, assessment integer, interview integer, offer integer, hired integer, joining integer, joined integer, still_needed integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH apps AS (
  SELECT x.rid, x.status, x.code,
         (x.jstatus IN ('open','paused') AND h.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')) AS live
  FROM (
    SELECT public.hr_wf_application_requirement(j.id, a.preferred_shifts) rid, a.status, st.code, j.status jstatus
    FROM public.ats_jobs j JOIN public.ats_applications a ON a.job_id = j.id
    LEFT JOIN public.ats_stages st ON st.id = a.stage_id
    WHERE p_requirement IS NULL OR j.requisition_id = p_requirement
       OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = j.id AND jr.requirement_id = p_requirement)
  ) x
  JOIN public.hr_hiring_requirements h ON h.id = x.rid
  WHERE p_requirement IS NULL OR x.rid = p_requirement
), f AS (
  SELECT rid, count(*)::int applied,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'new')::int n,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'screening')::int sc,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'assessment')::int asm,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'interview')::int iv,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'offer')::int ofr
  FROM apps GROUP BY rid
)
SELECT h.id, coalesce(f.applied,0), coalesce(f.n,0), coalesce(f.sc,0), coalesce(f.asm,0), coalesce(f.iv,0), coalesce(f.ofr,0),
  coalesce(rp.selected_hc,0), coalesce(rp.joining_hc,0), h.positions_filled,
  greatest(h.number_required - h.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0)
FROM public.hr_hiring_requirements h
LEFT JOIN f ON f.rid = h.id
LEFT JOIN public.hr_wf_requirement_people(p_requirement) rp ON rp.requirement_id = h.id
WHERE p_requirement IS NULL OR h.id = p_requirement
$function$;

-- 1.2 one job: close only when its whole set is filled; openings = sum still to find
CREATE OR REPLACE FUNCTION public.hr_wf_sync_job(p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE jb record; v_ids uuid[]; v_left int; v_no text; v_new int;
BEGIN
  SELECT id, openings, status INTO jb FROM public.ats_jobs WHERE id = p_job;
  IF jb.id IS NULL OR jb.status NOT IN ('open','paused') THEN RETURN; END IF;
  v_ids := ARRAY(SELECT public.ats_job_requirement_ids(p_job));
  IF cardinality(v_ids) = 0 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_hiring_requirements WHERE id = ANY(v_ids) AND status <> 'fulfilled') THEN
    UPDATE public.ats_jobs SET status = 'closed', closed_reason = 'Hiring requirement fulfilled' WHERE id = p_job;
    RETURN;
  END IF;
  SELECT coalesce(sum(greatest(r.number_required - coalesce(rp.joined_hc,0) - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0)), 0)::int,
         string_agg(r.requirement_no, ' + ' ORDER BY r.requirement_no)
    INTO v_left, v_no
    FROM public.hr_hiring_requirements r CROSS JOIN LATERAL public.hr_wf_requirement_people(r.id) rp
   WHERE r.id = ANY(v_ids) AND r.status IN ('approved','recruitment_active','partially_fulfilled');
  IF v_no IS NULL THEN RETURN; END IF;
  v_new := greatest(v_left, 1);
  IF jb.openings IS DISTINCT FROM v_new THEN
    UPDATE public.ats_jobs SET openings = v_new WHERE id = p_job;
    INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
    VALUES (p_job, 'job_openings', format('Openings %s → %s to match %s (%s still to find)', jb.openings, v_new, v_no, v_left),
            jsonb_build_object('requirement_id', NULL, 'from', jb.openings, 'to', v_new, 'still_to_find', v_left), 'System');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_sync_job(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_refresh_requirement(p_requirement uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_filled int; v_has_job boolean; v_new text; p record; jb uuid;
BEGIN
  IF p_requirement IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_requirement FOR UPDATE;
  IF NOT FOUND OR r.status IN ('draft','pending_approval','rejected','cancelled') THEN RETURN; END IF;
  SELECT * INTO p FROM public.hr_wf_requirement_people(p_requirement) LIMIT 1;
  v_filled := coalesce(p.joined_hc, 0);
  v_has_job := EXISTS (SELECT 1 FROM public.ats_jobs aj WHERE aj.status IN ('open','paused')
                 AND (aj.requisition_id = p_requirement
                      OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = aj.id AND jr.requirement_id = p_requirement)));
  v_new := CASE
    WHEN v_filled >= r.number_required THEN 'fulfilled'
    WHEN v_filled > 0 THEN 'partially_fulfilled'
    WHEN v_has_job THEN 'recruitment_active'
    WHEN r.status IN ('fulfilled','partially_fulfilled','recruitment_active') THEN 'approved'
    ELSE r.status END;
  UPDATE public.hr_hiring_requirements SET positions_filled = v_filled, status = v_new
   WHERE id = p_requirement AND (positions_filled IS DISTINCT FROM v_filled OR status IS DISTINCT FROM v_new);
  -- Inside the reconcile, jobs are handled by hr_wf_refresh_open_requirements (SKIP LOCKED).
  IF coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN RETURN; END IF;
  FOR jb IN SELECT aj.id FROM public.ats_jobs aj WHERE aj.status IN ('open','paused')
              AND (aj.requisition_id = p_requirement
                   OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = aj.id AND jr.requirement_id = p_requirement)) LOOP
    PERFORM public.hr_wf_sync_job(jb);
  END LOOP;
END $function$;

-- 1.3 / 1.7 progress trigger: queue the reconcile; keep history links on closed jobs
CREATE OR REPLACE FUNCTION public.hr_wf_progress_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old uuid; v_new uuid; v_ob uuid;
BEGIN
  IF TG_TABLE_NAME = 'ats_jobs' THEN
    PERFORM public.hr_wf_queue_reconcile();
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'ats_applications' THEN
    PERFORM public.hr_wf_queue_reconcile();
    SELECT hiring_requirement_id INTO v_ob FROM public.hr_employee_onboarding
     WHERE ats_application_id = NEW.id AND status <> 'cancelled' LIMIT 1;
    IF v_ob IS NOT NULL THEN PERFORM public.hr_wf_refresh_requirement(v_ob); END IF;
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'hr_employee_onboarding' THEN
    v_new := NEW.hiring_requirement_id;
    IF TG_OP = 'UPDATE' AND OLD.hiring_requirement_id IS DISTINCT FROM NEW.hiring_requirement_id THEN
      v_old := OLD.hiring_requirement_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_hiring_requirements' THEN
    IF NEW.status = 'cancelled' THEN
      DELETE FROM public.ats_job_requirements WHERE requirement_id = NEW.id;
      UPDATE public.ats_jobs j SET status = 'closed', closed_reason = 'Hiring requirement cancelled'
       WHERE j.requisition_id = NEW.id AND j.status IN ('open','paused')
         AND NOT EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = j.id);
      -- Closed jobs keep the link as history; jobs still recruiting for other requirements drop it.
      UPDATE public.ats_jobs SET requisition_id = NULL WHERE requisition_id = NEW.id AND status <> 'closed';
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.hr_wf_refresh_requirement(NEW.id);
    END IF;
    RETURN NULL;
  END IF;
  PERFORM public.hr_wf_refresh_requirement(v_new);
  IF v_old IS DISTINCT FROM v_new THEN PERFORM public.hr_wf_refresh_requirement(v_old); END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.ats_job_requirements_after_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.hr_wf_queue_reconcile();
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS ats_job_requirements_after_write ON public.ats_job_requirements;
CREATE TRIGGER ats_job_requirements_after_write AFTER INSERT OR UPDATE OR DELETE ON public.ats_job_requirements
  FOR EACH ROW EXECUTE FUNCTION public.ats_job_requirements_after_write();

-- 1.6 reconcile: never wait on job rows; skip jobs whose set was not fully locked
CREATE OR REPLACE FUNCTION public.hr_wf_refresh_open_requirements()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
                     WHEN r.status IN ('partially_fulfilled','recruitment_active') THEN 'approved'
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

  -- Requirements whose last recruiting job just closed are no longer being recruited.
  UPDATE public.hr_hiring_requirements h SET status = 'approved'
   WHERE h.status = 'recruitment_active'
     AND h.id IN (SELECT x.id FROM jsonb_to_recordset(v) AS x(id uuid))
     AND NOT EXISTS (SELECT 1 FROM public.ats_jobs aj WHERE aj.status IN ('open','paused')
                      AND (aj.requisition_id = h.id OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = aj.id AND jr.requirement_id = h.id)));

  WITH lk AS MATERIALIZED (
    SELECT aj.id, aj.openings FROM public.ats_jobs aj
     WHERE aj.status IN ('open','paused')
     FOR UPDATE SKIP LOCKED
  ), vx AS MATERIALIZED (
    SELECT * FROM jsonb_to_recordset(v) AS x(id uuid, no text, lft int, status text)
  ), js AS (
    SELECT lk.id, lk.openings, s.rid, (vx.id IS NOT NULL) AS in_v, h.status AS hs, vx.no, vx.lft, vx.status AS vs
      FROM lk CROSS JOIN LATERAL public.ats_job_requirement_ids(lk.id) AS s(rid)
      LEFT JOIN vx ON vx.id = s.rid
      LEFT JOIN public.hr_hiring_requirements h ON h.id = s.rid
  ), j AS (
    SELECT js.id, js.openings AS old_o,
           greatest(coalesce(sum(js.lft) FILTER (WHERE js.in_v AND js.vs <> 'fulfilled'), 0), 1)::int AS new_o,
           coalesce(sum(js.lft) FILTER (WHERE js.in_v AND js.vs <> 'fulfilled'), 0) AS lft,
           string_agg(js.no, ' + ' ORDER BY js.no) FILTER (WHERE js.in_v AND js.vs <> 'fulfilled') AS no
      FROM js
     GROUP BY js.id, js.openings
    -- every open requirement of the job must be in this run's locked set, else skip (no partial sums)
    HAVING bool_and(js.in_v OR js.hs IS NULL OR js.hs NOT IN ('approved','recruitment_active','partially_fulfilled'))
       AND bool_or(js.in_v AND js.vs <> 'fulfilled')
       AND js.openings IS DISTINCT FROM greatest(coalesce(sum(js.lft) FILTER (WHERE js.in_v AND js.vs <> 'fulfilled'), 0), 1)::int
  ), u AS (UPDATE public.ats_jobs t SET openings = j.new_o FROM j WHERE t.id = j.id RETURNING t.id)
  INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
  SELECT j.id, 'job_openings', format('Openings %s → %s to match %s (%s still to find)', j.old_o, j.new_o, j.no, j.lft),
         jsonb_build_object('requirement_id', NULL, 'from', j.old_o, 'to', j.new_o, 'still_to_find', j.lft), 'System'
  FROM j JOIN u ON u.id = j.id;
END $function$;

-- 1.9 one validation for the main link and link rows
CREATE OR REPLACE FUNCTION public.ats_validate_job_requirement_core(
  p_dept uuid, p_pos uuid, p_shifts uuid[],
  r_no text, r_status text, r_dept uuid, r_pos uuid, r_plan uuid, p_require_open boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.hr_headcount_plans%ROWTYPE; v_roles uuid[];
BEGIN
  IF p_require_open AND r_status NOT IN ('approved','recruitment_active','partially_fulfilled') THEN
    RAISE EXCEPTION 'Requirement % is not open for recruitment', r_no;
  END IF;
  IF p_dept IS NOT NULL AND r_dept IS NOT NULL AND r_dept IS DISTINCT FROM p_dept THEN
    RAISE EXCEPTION 'Requirement % is for a different department than this job', r_no;
  END IF;
  IF r_plan IS NOT NULL THEN SELECT * INTO p FROM public.hr_headcount_plans WHERE id = r_plan; END IF;
  v_roles := (CASE WHEN p.id IS NOT NULL THEN public.hr_wf_roles(p.position_id, p.eligible_position_ids) ELSE '{}'::uuid[] END)
             || array_remove(ARRAY[r_pos], NULL);
  IF p_pos IS NOT NULL AND cardinality(v_roles) > 0 AND NOT (p_pos = ANY(v_roles)) THEN
    RAISE EXCEPTION 'Requirement % is for a different role than this job', r_no;
  END IF;
  IF p.id IS NOT NULL AND p.is_active AND cardinality(coalesce(p_shifts, '{}')) > 0
     AND cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) > 0
     AND NOT EXISTS (SELECT 1 FROM unnest(p_shifts) AS s(id)
                      WHERE public.hr_wf_planning_shift(s.id) = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))) THEN
    RAISE EXCEPTION 'Requirement % covers none of this job''s shifts', r_no;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.ats_validate_job_requirement_core(uuid, uuid, uuid[], text, text, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ats_validate_job_requirement(p_dept uuid, p_pos uuid, p_shifts uuid[], p_req uuid, p_require_open boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.hr_hiring_requirements%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_req;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Unknown hiring requirement'; END IF;
  PERFORM public.ats_validate_job_requirement_core(p_dept, p_pos, p_shifts, r.requirement_no, r.status, r.department_id, r.position_id, r.staffing_plan_id, p_require_open);
END $$;
REVOKE ALL ON FUNCTION public.ats_validate_job_requirement(uuid, uuid, uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ats_job_requirements_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE j public.ats_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.ats_jobs WHERE id = NEW.job_id;
  IF j.id IS NULL THEN RAISE EXCEPTION 'Unknown job or requirement'; END IF;
  IF j.status = 'closed' THEN RETURN NEW; END IF;
  PERFORM public.ats_validate_job_requirement(j.department_id, j.position_id, j.shift_ids, NEW.requirement_id,
    TG_OP = 'INSERT' OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id);
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS ats_job_requirements_check ON public.ats_job_requirements;
CREATE TRIGGER ats_job_requirements_check BEFORE INSERT OR UPDATE ON public.ats_job_requirements
  FOR EACH ROW EXECUTE FUNCTION public.ats_job_requirements_check();

CREATE OR REPLACE FUNCTION public.ats_jobs_requisition_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.requisition_id IS NULL OR NEW.status = 'closed' THEN RETURN NEW; END IF;
  PERFORM public.ats_validate_job_requirement(NEW.department_id, NEW.position_id, NEW.shift_ids, NEW.requisition_id,
    TG_OP = 'INSERT' OR NEW.requisition_id IS DISTINCT FROM OLD.requisition_id);
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS ats_jobs_requisition_check ON public.ats_jobs;
CREATE TRIGGER ats_jobs_requisition_check BEFORE INSERT OR UPDATE OF requisition_id, department_id, position_id, shift_ids, status ON public.ats_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ats_jobs_requisition_check();

-- a requirement moving line must still fit the open jobs it feeds
CREATE OR REPLACE FUNCTION public.hr_wf_requirement_line_jobs_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE j record;
BEGIN
  IF coalesce(current_setting('hr.wf_reconciling', true), '') = '1' OR NEW.status IN ('cancelled','rejected','fulfilled') THEN RETURN NEW; END IF;
  FOR j IN SELECT aj.* FROM public.ats_jobs aj WHERE aj.status IN ('open','paused')
             AND (aj.requisition_id = NEW.id OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = aj.id AND jr.requirement_id = NEW.id)) LOOP
    PERFORM public.ats_validate_job_requirement_core(j.department_id, j.position_id, j.shift_ids,
      NEW.requirement_no, NEW.status, NEW.department_id, NEW.position_id, NEW.staffing_plan_id, false);
  END LOOP;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS zz_hr_wf_requirement_line_jobs_check ON public.hr_hiring_requirements;
CREATE TRIGGER zz_hr_wf_requirement_line_jobs_check BEFORE UPDATE ON public.hr_hiring_requirements
  FOR EACH ROW WHEN (OLD.staffing_plan_id IS DISTINCT FROM NEW.staffing_plan_id OR OLD.position_id IS DISTINCT FROM NEW.position_id OR OLD.department_id IS DISTINCT FROM NEW.department_id)
  EXECUTE FUNCTION public.hr_wf_requirement_line_jobs_check();

-- 1.10 save a job and its links in one transaction (runs as the caller, so the same access rules apply)
CREATE OR REPLACE FUNCTION public.ats_save_job(p_job_id uuid, p_job jsonb, p_links uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE v_cols text; v_id uuid; v_prim uuid; v_row jsonb;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'ats_jobs' AND p_job ? c.column_name
     AND c.column_name NOT IN ('id','job_code','created_at','updated_at','created_by','created_by_name','opened_at','closed_at');
  IF v_cols IS NULL THEN RAISE EXCEPTION 'Nothing to save'; END IF;
  IF p_job_id IS NULL THEN
    EXECUTE format('INSERT INTO public.ats_jobs (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.ats_jobs, $1) RETURNING id', v_cols)
      INTO v_id USING p_job;
  ELSE
    EXECUTE format('UPDATE public.ats_jobs SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.ats_jobs, $1)) WHERE id = $2 RETURNING id', v_cols)
      INTO v_id USING p_job, p_job_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Job not found or you cannot edit it' USING ERRCODE = '42501'; END IF;
  END IF;
  IF p_links IS NOT NULL THEN
    SELECT requisition_id INTO v_prim FROM public.ats_jobs WHERE id = v_id;
    DELETE FROM public.ats_job_requirements
     WHERE job_id = v_id AND (requirement_id IS NOT DISTINCT FROM v_prim OR NOT (requirement_id = ANY(p_links)));
    INSERT INTO public.ats_job_requirements (job_id, requirement_id)
    SELECT v_id, x FROM (SELECT DISTINCT unnest(p_links) AS x) s
     WHERE x IS NOT NULL AND x IS DISTINCT FROM v_prim
    ON CONFLICT DO NOTHING;
  END IF;
  SELECT to_jsonb(j) INTO v_row FROM public.ats_jobs j WHERE j.id = v_id;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.ats_save_job(uuid, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_save_job(uuid, jsonb, uuid[]) TO authenticated, service_role;