
CREATE TABLE public.ats_job_requirements (
  job_id uuid NOT NULL REFERENCES public.ats_jobs(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.hr_hiring_requirements(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, requirement_id)
);
GRANT SELECT, INSERT, DELETE ON public.ats_job_requirements TO authenticated;
GRANT ALL ON public.ats_job_requirements TO service_role;
ALTER TABLE public.ats_job_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ats_job_requirements_select ON public.ats_job_requirements FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY ats_job_requirements_insert ON public.ats_job_requirements FOR INSERT TO authenticated WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY ats_job_requirements_delete ON public.ats_job_requirements FOR DELETE TO authenticated USING (public.hr_is_hr_staff(auth.uid()));

-- The full set of requirements a job feeds: its single requisition_id plus the link table.
CREATE OR REPLACE FUNCTION public.ats_job_requirement_ids(p_job uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.requisition_id FROM public.ats_jobs j WHERE j.id = p_job AND j.requisition_id IS NOT NULL
  UNION
  SELECT jr.requirement_id FROM public.ats_job_requirements jr WHERE jr.job_id = p_job
$$;
GRANT EXECUTE ON FUNCTION public.ats_job_requirement_ids(uuid) TO authenticated, service_role;

-- Link validation: recruiting requirement, same department/role as the job, staffing line covers a job shift.
CREATE OR REPLACE FUNCTION public.ats_job_requirements_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE j public.ats_jobs%ROWTYPE; r public.hr_hiring_requirements%ROWTYPE; p public.hr_headcount_plans%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.ats_jobs WHERE id = NEW.job_id;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = NEW.requirement_id;
  IF j.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Unknown job or requirement'; END IF;
  IF r.status NOT IN ('approved','recruitment_active','partially_fulfilled') THEN
    RAISE EXCEPTION 'Requirement % is not open for recruitment', r.requirement_no;
  END IF;
  IF j.department_id IS NOT NULL AND r.department_id IS NOT NULL AND r.department_id IS DISTINCT FROM j.department_id THEN
    RAISE EXCEPTION 'Requirement % is for a different department than this job', r.requirement_no;
  END IF;
  IF j.position_id IS NOT NULL AND r.position_id IS DISTINCT FROM j.position_id THEN
    RAISE EXCEPTION 'Requirement % is for a different role than this job', r.requirement_no;
  END IF;
  IF r.staffing_plan_id IS NOT NULL AND cardinality(coalesce(j.shift_ids, '{}')) > 0 THEN
    SELECT * INTO p FROM public.hr_headcount_plans WHERE id = r.staffing_plan_id;
    IF p.id IS NOT NULL AND p.is_active
       AND cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) > 0
       AND NOT EXISTS (
         SELECT 1 FROM unnest(j.shift_ids) AS s(id)
         WHERE public.hr_wf_planning_shift(s.id) = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))
       ) THEN
      RAISE EXCEPTION 'Requirement % covers none of this job''s shifts', r.requirement_no;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ats_job_requirements_check BEFORE INSERT ON public.ats_job_requirements FOR EACH ROW EXECUTE FUNCTION public.ats_job_requirements_check();

-- Keep requirement progress fresh when links change.
CREATE OR REPLACE FUNCTION public.ats_job_requirements_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.hr_wf_refresh_requirement(coalesce(NEW.requirement_id, OLD.requirement_id));
  RETURN NULL;
END $$;
CREATE TRIGGER ats_job_requirements_after_write AFTER INSERT OR DELETE ON public.ats_job_requirements FOR EACH ROW EXECUTE FUNCTION public.ats_job_requirements_after_write();

-- Pipeline attribution: an active application's job counts toward every linked requirement.
CREATE OR REPLACE FUNCTION public.hr_wf_requirement_people(p_requirement uuid DEFAULT NULL::uuid)
RETURNS TABLE(requirement_id uuid, pipeline_hc integer, selected_hc integer, joining_hc integer, joined_hc integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  SELECT rid, count(*)::int n FROM (
    SELECT j.requisition_id rid, a.id app
    FROM public.ats_jobs j JOIN public.ats_applications a ON a.job_id = j.id
    WHERE j.requisition_id IS NOT NULL AND j.status IN ('open','paused') AND a.status IN ('active','on_hold')
    UNION ALL
    SELECT jr.requirement_id, a.id
    FROM public.ats_job_requirements jr
    JOIN public.ats_jobs j ON j.id = jr.job_id
    JOIN public.ats_applications a ON a.job_id = j.id
    WHERE j.status IN ('open','paused') AND a.status IN ('active','on_hold')
      AND jr.requirement_id IS DISTINCT FROM j.requisition_id
  ) s
  WHERE (p_requirement IS NULL OR s.rid = p_requirement)
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

-- Progress trigger: refresh every linked requirement; on cancel, unlink and close only jobs left with no link.
CREATE OR REPLACE FUNCTION public.hr_wf_progress_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_old uuid; v_new uuid; v_ob uuid; v_req uuid;
BEGIN
  IF TG_TABLE_NAME = 'ats_jobs' THEN
    FOR v_req IN SELECT public.ats_job_requirement_ids(NEW.id) LOOP
      PERFORM public.hr_wf_refresh_requirement(v_req);
    END LOOP;
    IF TG_OP = 'UPDATE' THEN
      FOR v_req IN SELECT public.ats_job_requirement_ids(OLD.id) LOOP
        PERFORM public.hr_wf_refresh_requirement(v_req);
      END LOOP;
    END IF;
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'ats_applications' THEN
    FOR v_req IN SELECT public.ats_job_requirement_ids(NEW.job_id) LOOP
      PERFORM public.hr_wf_refresh_requirement(v_req);
    END LOOP;
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
      FOR v_req IN SELECT public.ats_job_requirement_ids(OLD.job_id) LOOP
        PERFORM public.hr_wf_refresh_requirement(v_req);
      END LOOP;
    END IF;
    SELECT hiring_requirement_id INTO v_ob FROM public.hr_employee_onboarding
     WHERE ats_application_id = NEW.id AND status <> 'cancelled' LIMIT 1;
    IF v_ob IS NOT NULL THEN PERFORM public.hr_wf_refresh_requirement(v_ob); END IF;
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
      UPDATE public.ats_jobs SET requisition_id = NULL WHERE requisition_id = NEW.id;
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.hr_wf_refresh_requirement(NEW.id);
    END IF;
    RETURN NULL;
  END IF;
  PERFORM public.hr_wf_refresh_requirement(v_new);
  IF v_old IS DISTINCT FROM v_new THEN PERFORM public.hr_wf_refresh_requirement(v_old); END IF;
  RETURN NULL;
END $function$;

-- Reconcile: a linked job closes only when every linked requirement is filled; openings = total still needed.
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
    WHERE aj.status IN ('open','paused') AND aj.openings IS DISTINCT FROM greatest(sum(x.lft), 1)::int
    GROUP BY aj.id, aj.openings
    FOR UPDATE OF aj SKIP LOCKED
  ), u AS (UPDATE public.ats_jobs t SET openings = j.new_o FROM j WHERE t.id = j.id RETURNING t.id)
  INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
  SELECT j.id, 'job_openings', format('Openings %s → %s to match %s (%s still to find)', j.old_o, j.new_o, j.no, j.lft),
         jsonb_build_object('requirement_id', NULL, 'from', j.old_o, 'to', j.new_o, 'still_to_find', j.lft), 'System'
  FROM j JOIN u ON u.id = j.id;
END $function$;

-- Hire hand-off: prefer the linked requirement whose staffing line covers the hired shift.
CREATE OR REPLACE FUNCTION public.hr_ats_hire_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_actor text := public.ats_actor_name(auth.uid());
  c public.ats_candidates%ROWTYPE; j public.ats_jobs%ROWTYPE; rq public.hr_hiring_requirements%ROWTYPE; o public.hr_employee_onboarding%ROWTYPE;
  x public.hr_employee_onboarding%ROWTYPE;
  v_first text; v_last text; v_shift uuid; v_type text; v_id uuid; v_sids uuid[]; v_req uuid; v_pref text; v_other text;
  v_pref_req uuid;
  v_old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END;
BEGIN
  IF NEW.status = 'hired' AND v_old_status IS DISTINCT FROM 'hired' THEN
    BEGIN
      SELECT * INTO c FROM public.ats_candidates WHERE id = NEW.candidate_id;
      SELECT * INTO o FROM public.hr_employee_onboarding WHERE ats_application_id = NEW.id ORDER BY (status = 'cancelled'), created_at LIMIT 1;
      IF FOUND THEN
        IF o.status = 'cancelled' THEN
          SELECT * INTO x FROM public.hr_employee_onboarding
           WHERE id <> o.id AND lower(email) = lower(coalesce(o.email, c.email)) AND status NOT IN ('completed','cancelled') LIMIT 1;
          IF FOUND THEN
            INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
            VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft',
                    'Onboarding draft not restored — another onboarding is already open for this email',
                    jsonb_build_object('onboarding_id', x.id), v_uid, v_actor);
          ELSE
            UPDATE public.hr_employee_onboarding SET status = 'draft', updated_at = now() WHERE id = o.id;
            INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
            VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding draft restored',
                    jsonb_build_object('onboarding_id', o.id), v_uid, v_actor);
          END IF;
        END IF;
        RETURN NULL;
      END IF;

      SELECT * INTO j FROM public.ats_jobs WHERE id = NEW.job_id;
      IF j.requisition_id IS NOT NULL THEN SELECT * INTO rq FROM public.hr_hiring_requirements WHERE id = j.requisition_id; END IF;
      IF rq.id IS NULL THEN
        SELECT * INTO rq FROM public.hr_hiring_requirements
         WHERE id = ANY(ARRAY(SELECT public.ats_job_requirement_ids(j.id))) ORDER BY requirement_no LIMIT 1;
      END IF;
      v_sids := coalesce(j.shift_ids, '{}');
      v_shift := nullif(current_setting('ats.hired_shift', true), '')::uuid;
      IF v_shift IS NOT NULL AND cardinality(v_sids) > 0 AND NOT (v_shift = ANY(v_sids)) THEN v_shift := NULL; END IF;
      IF v_shift IS NULL AND cardinality(v_sids) = 1 THEN v_shift := v_sids[1]; END IF;
      IF v_shift IS NULL AND cardinality(coalesce(NEW.preferred_shifts, '{}')) = 1 THEN
        v_pref := btrim(NEW.preferred_shifts[1]);
        SELECT s.id INTO v_shift FROM public.hr_shifts s
         WHERE (s.id::text = v_pref OR lower(s.name) = lower(v_pref)) AND (cardinality(v_sids) = 0 OR s.id = ANY(v_sids)) LIMIT 1;
      END IF;
      v_shift := coalesce(v_shift, rq.shift_id);
      SELECT s.rid INTO v_pref_req
        FROM (SELECT j.requisition_id AS rid WHERE j.requisition_id IS NOT NULL
              UNION SELECT jr.requirement_id FROM public.ats_job_requirements jr WHERE jr.job_id = j.id) s
        JOIN public.hr_hiring_requirements r ON r.id = s.rid
        LEFT JOIN public.hr_headcount_plans p ON p.id = r.staffing_plan_id
       WHERE r.status IN ('approved','recruitment_active','partially_fulfilled')
         AND (p.id IS NULL OR (p.is_active AND (v_shift IS NULL
              OR cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
              OR public.hr_wf_planning_shift(v_shift) = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)))))
       ORDER BY (s.rid = j.requisition_id) DESC, s.rid
       LIMIT 1;
      v_req := public.hr_wf_pick_requirement(coalesce(j.department_id, rq.department_id), coalesce(j.position_id, rq.position_id), v_shift, v_pref_req);
      v_type := public.hr_wf_onboarding_employee_type(coalesce(j.employment_type, rq.employment_type));

      SELECT * INTO x FROM public.hr_employee_onboarding
       WHERE c.email IS NOT NULL AND lower(email) = lower(c.email) AND status NOT IN ('completed','cancelled')
       ORDER BY created_at LIMIT 1;
      IF FOUND THEN
        IF x.ats_application_id IS NULL THEN
          UPDATE public.hr_employee_onboarding
             SET ats_application_id = NEW.id,
                 hiring_requirement_id = coalesce(hiring_requirement_id,
                   CASE WHEN department_id IS NOT DISTINCT FROM coalesce(j.department_id, rq.department_id)
                         AND position_id IS NOT DISTINCT FROM coalesce(j.position_id, rq.position_id) THEN v_req END),
                 updated_at = now()
           WHERE id = x.id;
          INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
          VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Linked to the existing onboarding',
                  jsonb_build_object('onboarding_id', x.id), v_uid, v_actor);
        ELSE
          SELECT coalesce(j2.job_code, 'a general application') INTO v_other
            FROM public.ats_applications a2 LEFT JOIN public.ats_jobs j2 ON j2.id = a2.job_id WHERE a2.id = x.ats_application_id;
          INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
          VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft',
                  format('No new onboarding — this person is already being onboarded from %s', coalesce(v_other, 'another application')),
                  jsonb_build_object('onboarding_id', x.id, 'other_application_id', x.ats_application_id), v_uid, v_actor);
        END IF;
        RETURN NULL;
      END IF;

      v_first := split_part(btrim(coalesce(c.full_name,'')), ' ', 1);
      v_last := btrim(substr(btrim(coalesce(c.full_name,'')), length(v_first) + 1));
      INSERT INTO public.hr_employee_onboarding (status, current_stage, first_name, last_name, email, phone,
        department_id, position_id, shift_id, employee_type, created_by, ats_application_id, hiring_requirement_id)
      VALUES ('draft', 1, nullif(v_first,''), coalesce(v_last,''), c.email, c.phone,
        coalesce(j.department_id, rq.department_id), coalesce(j.position_id, rq.position_id), v_shift, v_type, v_uid, NEW.id, v_req)
      RETURNING id INTO v_id;
      INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
      VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding draft created',
              jsonb_build_object('onboarding_id', v_id, 'hiring_requirement_id', v_req, 'shift_id', v_shift), v_uid, v_actor);
    EXCEPTION WHEN others THEN
      INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
      VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft',
              'Onboarding draft not created — start onboarding for this person by hand',
              jsonb_build_object('error', SQLERRID), v_uid, v_actor);
    END;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'hired' AND NEW.status IS DISTINCT FROM 'hired' THEN
    SELECT * INTO o FROM public.hr_employee_onboarding WHERE ats_application_id = NEW.id AND status <> 'cancelled' LIMIT 1;
    IF FOUND THEN
      IF o.status = 'draft' AND coalesce(o.current_stage,1) <= 1 AND o.employee_id IS NULL
         AND coalesce(o.documents, '[]'::jsonb) IN ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb) THEN
        UPDATE public.hr_employee_onboarding SET status = 'cancelled', updated_at = now() WHERE id = o.id;
        INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
        VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Hire undone — onboarding draft cancelled',
                jsonb_build_object('onboarding_id', o.id), v_uid, v_actor);
      ELSE
        INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
        VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding is already in progress — review it',
                jsonb_build_object('onboarding_id', o.id, 'onboarding_status', o.status), v_uid, v_actor);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $function$;
