-- W1 Workforce Planning engine
-- A. Shift planning groups
ALTER TABLE public.hr_shifts
  ADD COLUMN IF NOT EXISTS planning_shift_id uuid REFERENCES public.hr_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_training_shift boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.hr_shifts.planning_shift_id IS 'Counts as this shift for workforce planning and seating; NULL = counts as itself.';
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS in_workforce_planning boolean NOT NULL DEFAULT true;
ALTER TABLE public.hr_headcount_plans
  ADD COLUMN IF NOT EXISTS seat_capacity_id uuid REFERENCES public.hr_seat_capacity(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_desks boolean NOT NULL DEFAULT false;
ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS post_training_shift_id uuid REFERENCES public.hr_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ats_application_id uuid UNIQUE REFERENCES public.ats_applications(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.hr_wf_planning_shift(p_shift uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(s.planning_shift_id, s.id) FROM public.hr_shifts s WHERE s.id = p_shift
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_shift_groups(p_shift uuid, p_eligible uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT g ORDER BY g), '{}'::uuid[])
  FROM (SELECT public.hr_wf_planning_shift(x) g
        FROM unnest(array_prepend(p_shift, coalesce(p_eligible,'{}'::uuid[]))) x WHERE x IS NOT NULL) t
  WHERE g IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_roles(p_position uuid, p_eligible uuid[]) RETURNS uuid[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN cardinality(coalesce(p_eligible,'{}'::uuid[])) > 0 THEN p_eligible
              ELSE array_remove(ARRAY[p_position], NULL) END
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_norm_employment_type(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    ELSE CASE lower(regexp_replace(btrim(p), '[\s-]+', '_', 'g'))
      WHEN 'full_time' THEN 'full_time' WHEN 'fulltime' THEN 'full_time'
      WHEN 'part_time' THEN 'part_time' WHEN 'parttime' THEN 'part_time'
      WHEN 'contract' THEN 'contract' WHEN 'consultant' THEN 'contract'
      WHEN 'intern' THEN 'internship' WHEN 'internship' THEN 'internship'
      WHEN 'trainee' THEN 'trainee'
      ELSE lower(regexp_replace(btrim(p), '[\s-]+', '_', 'g')) END
  END
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_validate_shift_group() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.planning_shift_id IS NOT NULL THEN
    IF NEW.planning_shift_id = NEW.id THEN NEW.planning_shift_id := NULL; RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.hr_shifts s WHERE s.id = NEW.planning_shift_id AND s.planning_shift_id IS NOT NULL) THEN
      RAISE EXCEPTION 'A shift can only count as a shift that counts as itself (no chains).';
    END IF;
    IF EXISTS (SELECT 1 FROM public.hr_shifts s WHERE s.planning_shift_id = NEW.id) THEN
      RAISE EXCEPTION 'Other shifts count as this shift, so it cannot itself count as another shift.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_validate_shift_group ON public.hr_shifts;
CREATE TRIGGER trg_hr_wf_validate_shift_group BEFORE INSERT OR UPDATE OF planning_shift_id ON public.hr_shifts
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_validate_shift_group();

CREATE OR REPLACE FUNCTION public.hr_wf_normalize_employment_type() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.employment_type := public.hr_wf_norm_employment_type(NEW.employment_type); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_norm_emp_type ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_wf_norm_emp_type BEFORE INSERT OR UPDATE OF employment_type ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_normalize_employment_type();
DROP TRIGGER IF EXISTS trg_hr_wf_norm_emp_type ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_norm_emp_type BEFORE INSERT OR UPDATE OF employment_type ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_normalize_employment_type();

CREATE OR REPLACE FUNCTION public.hr_wf_follow_desks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF NEW.follow_desks THEN
    IF NEW.seat_capacity_id IS NULL THEN
      RAISE EXCEPTION 'Pick the desk group this line follows, or switch off "follow desks".';
    END IF;
    SELECT CASE WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END
      INTO v FROM public.hr_seat_capacity sc WHERE sc.id = NEW.seat_capacity_id;
    NEW.approved_hc := coalesce(v, 0);
    NEW.required_hc := coalesce(v, 0);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_follow_desks ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_wf_follow_desks BEFORE INSERT OR UPDATE ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_follow_desks();

CREATE OR REPLACE FUNCTION public.hr_wf_validate_line_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; c record; v_roles uuid[]; v_groups uuid[];
BEGIN
  SELECT * INTO r FROM public.hr_headcount_plans WHERE id = NEW.id;
  IF NOT FOUND OR NOT r.is_active THEN RETURN NULL; END IF;
  v_roles := public.hr_wf_roles(r.position_id, r.eligible_position_ids);
  v_groups := public.hr_wf_shift_groups(r.shift_id, r.eligible_shift_ids);
  SELECT p.id, pos.title,
         coalesce((SELECT string_agg(s.name, ' + ') FROM public.hr_shifts s
                    WHERE s.id = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))), 'any shift') AS shifts
    INTO c
    FROM public.hr_headcount_plans p
    LEFT JOIN public.positions pos ON pos.id = p.position_id
   WHERE p.is_active AND p.id <> r.id
     AND p.department_id IS NOT DISTINCT FROM r.department_id
     AND public.hr_wf_roles(p.position_id, p.eligible_position_ids) && v_roles
     AND (cardinality(v_groups) = 0
          OR cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
          OR public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) && v_groups)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This staffing line overlaps an existing active line (% · %). A role can have one line per shift, or a single "any shift" line — not both.',
      coalesce(c.title, 'role'), c.shifts;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_hr_headcount_plan_no_overlap ON public.hr_headcount_plans;
CREATE CONSTRAINT TRIGGER trg_hr_headcount_plan_no_overlap
  AFTER INSERT OR UPDATE ON public.hr_headcount_plans
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hr_wf_validate_line_overlap();

CREATE OR REPLACE FUNCTION public.hr_wf_people()
RETURNS TABLE(employee_id uuid, department_id uuid, position_id uuid, shift_id uuid, group_id uuid, is_training boolean, resignation_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH cs AS (
  SELECT DISTINCT ON (sch.employee_id) sch.employee_id, sch.shift_id
  FROM public.hr_employee_shift_schedule sch
  WHERE sch.is_current AND sch.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY sch.employee_id, sch.effective_from DESC, sch.created_at DESC
)
SELECT e.id, w.department_id, w.job_position_id, coalesce(cs.shift_id, w.shift_id),
       public.hr_wf_planning_shift(coalesce(cs.shift_id, w.shift_id)),
       coalesce(sh.is_training_shift, false), e.resignation_status
FROM public.hr_employee_work_info w
JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active AND coalesce(e.resignation_status,'') <> 'completed'
LEFT JOIN public.positions pos ON pos.id = w.job_position_id
LEFT JOIN cs ON cs.employee_id = w.employee_id
LEFT JOIN public.hr_shifts sh ON sh.id = coalesce(cs.shift_id, w.shift_id)
WHERE pos.id IS NULL OR (pos.is_active AND pos.in_workforce_planning)
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_requirement_people(p_requirement uuid DEFAULT NULL)
RETURNS TABLE(requirement_id uuid, pipeline_hc int, selected_hc int, joining_hc int, joined_hc int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT j.requisition_id,
  count(*) FILTER (WHERE a.status IN ('active','on_hold'))::int,
  count(*) FILTER (WHERE a.status = 'hired' AND NOT x.joined AND NOT x.joining)::int,
  count(*) FILTER (WHERE x.joining AND NOT x.joined)::int,
  count(*) FILTER (WHERE x.joined)::int
FROM public.ats_jobs j
JOIN public.ats_applications a ON a.job_id = j.id
CROSS JOIN LATERAL (SELECT
  EXISTS (SELECT 1 FROM public.hr_employee_onboarding o
           WHERE o.ats_application_id = a.id AND o.status = 'completed' AND o.employee_id IS NOT NULL) AS joined,
  EXISTS (SELECT 1 FROM public.hr_employee_onboarding o
           WHERE o.ats_application_id = a.id AND o.status NOT IN ('completed','cancelled')
             AND o.date_of_joining IS NOT NULL) AS joining) x
WHERE j.requisition_id IS NOT NULL AND (p_requirement IS NULL OR j.requisition_id = p_requirement)
GROUP BY j.requisition_id
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_line_base()
RETURNS TABLE(plan_id uuid, department_id uuid, roles uuid[], groups uuid[], group_name text, group_start time,
              required_hc int, current_hc int, notice_hc int, pipeline_hc int, selected_hc int, joining_hc int,
              net_need int, open_count int, open_hc int, committed_hc int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH lines AS (
  SELECT p.id, p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) AS roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) AS groups, p.required_hc
  FROM public.hr_headcount_plans p WHERE p.is_active
),
ppl AS (SELECT * FROM public.hr_wf_people() WHERE NOT is_training),
rp AS (SELECT * FROM public.hr_wf_requirement_people(NULL)),
req AS (
  SELECT hr.staffing_plan_id AS pid,
    count(*) FILTER (WHERE hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled'))::int AS open_count,
    coalesce(sum(greatest(hr.number_required - hr.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0))
      FILTER (WHERE hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')),0)::int AS open_hc,
    coalesce(sum(greatest(hr.number_required - hr.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0))
      FILTER (WHERE hr.status IN ('approved','recruitment_active','partially_fulfilled')),0)::int AS committed_hc,
    coalesce(sum(rp.pipeline_hc),0)::int AS pipeline_hc,
    coalesce(sum(rp.selected_hc),0)::int AS selected_hc,
    coalesce(sum(rp.joining_hc),0)::int AS linked_joining_hc
  FROM public.hr_hiring_requirements hr
  LEFT JOIN rp ON rp.requirement_id = hr.id
  WHERE hr.staffing_plan_id IS NOT NULL
  GROUP BY hr.staffing_plan_id
),
unlinked AS (
  SELECT o.department_id, o.position_id,
         public.hr_wf_planning_shift(coalesce(o.post_training_shift_id, o.shift_id)) AS grp
  FROM public.hr_employee_onboarding o
  WHERE o.status NOT IN ('completed','cancelled') AND o.date_of_joining IS NOT NULL
    AND o.ats_application_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = o.employee_id AND e.is_active)
),
x AS (
  SELECT l.*,
    (SELECT count(*) FROM ppl e WHERE e.department_id IS NOT DISTINCT FROM l.department_id AND e.position_id = ANY(l.roles)
       AND (cardinality(l.groups) = 0 OR e.group_id = ANY(l.groups)))::int AS cur,
    (SELECT count(*) FROM ppl e WHERE e.department_id IS NOT DISTINCT FROM l.department_id AND e.position_id = ANY(l.roles)
       AND (cardinality(l.groups) = 0 OR e.group_id = ANY(l.groups)) AND e.resignation_status = 'notice_period')::int AS notice,
    (SELECT count(*) FROM unlinked u WHERE u.department_id IS NOT DISTINCT FROM l.department_id AND u.position_id = ANY(l.roles)
       AND (cardinality(l.groups) = 0 OR u.grp = ANY(l.groups)))::int AS unlinked_join
  FROM lines l
)
SELECT x.id, x.department_id, x.roles, x.groups,
  CASE WHEN cardinality(x.groups) = 0 THEN 'Any shift'
       ELSE (SELECT string_agg(s.name, ' + ' ORDER BY s.start_time) FROM public.hr_shifts s WHERE s.id = ANY(x.groups)) END,
  (SELECT min(s.start_time) FROM public.hr_shifts s WHERE s.id = ANY(x.groups)),
  x.required_hc, x.cur, x.notice,
  coalesce(req.pipeline_hc,0), coalesce(req.selected_hc,0), coalesce(req.linked_joining_hc,0) + x.unlinked_join,
  greatest(x.required_hc - x.cur - coalesce(req.selected_hc,0) - coalesce(req.linked_joining_hc,0) - x.unlinked_join, 0),
  coalesce(req.open_count,0), coalesce(req.open_hc,0), coalesce(req.committed_hc,0)
FROM x LEFT JOIN req ON req.pid = x.id
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_trainee_allocation()
RETURNS TABLE(out_employee_id uuid, out_plan_id uuid, out_ready_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base jsonb; v_alloc jsonb := '{}'::jsonb; t record; v_plan text; v_post uuid;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_base FROM public.hr_wf_line_base() b;
  FOR t IN
    SELECT p.employee_id, p.department_id, p.position_id, o.post_training_shift_id, o.training_completion_date
    FROM public.hr_wf_people() p
    LEFT JOIN LATERAL (
      SELECT ob.post_training_shift_id, ob.training_completion_date FROM public.hr_employee_onboarding ob
      WHERE ob.employee_id = p.employee_id AND ob.status <> 'cancelled'
      ORDER BY ob.created_at DESC LIMIT 1) o ON true
    WHERE p.is_training
    ORDER BY o.training_completion_date NULLS LAST, p.employee_id
  LOOP
    v_post := public.hr_wf_planning_shift(t.post_training_shift_id);
    SELECT b->>'plan_id' INTO v_plan
    FROM jsonb_array_elements(v_base) b
    CROSS JOIN LATERAL (SELECT (b->>'net_need')::int - coalesce((v_alloc->>(b->>'plan_id'))::int, 0) AS rem) r
    WHERE (b->>'department_id') IS NOT DISTINCT FROM t.department_id::text
      AND t.position_id::text IN (SELECT jsonb_array_elements_text(b->'roles'))
      AND (
        (v_post IS NOT NULL AND (jsonb_array_length(b->'groups') = 0
              OR v_post::text IN (SELECT jsonb_array_elements_text(b->'groups'))))
        OR (v_post IS NULL AND r.rem > 0))
    ORDER BY (r.rem - (b->>'open_hc')::int > 0) DESC, r.rem DESC, (b->>'group_start') NULLS LAST, b->>'plan_id'
    LIMIT 1;
    IF v_plan IS NOT NULL THEN
      v_alloc := jsonb_set(v_alloc, ARRAY[v_plan], to_jsonb(coalesce((v_alloc->>v_plan)::int, 0) + 1));
      out_employee_id := t.employee_id; out_plan_id := v_plan::uuid; out_ready_date := t.training_completion_date;
      RETURN NEXT;
    END IF;
    v_plan := NULL;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.hr_workforce_staffing_matrix();
CREATE FUNCTION public.hr_workforce_staffing_matrix()
RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text,
  shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer,
  current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer,
  notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer,
  shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date,
  over_requested_hc integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH b AS (SELECT * FROM public.hr_wf_line_base()),
tr AS (SELECT out_plan_id AS pid, count(*)::int AS n, min(out_ready_date) AS rd FROM public.hr_wf_trainee_allocation() GROUP BY 1)
SELECT p.id, p.department_id, d.name, p.position_id,
  CASE WHEN cardinality(p.eligible_position_ids) > 1 THEN (
    SELECT string_agg(pos2.title, ' / ' ORDER BY array_position(p.eligible_position_ids, pos2.id))
    FROM public.positions pos2 WHERE pos2.id = ANY(p.eligible_position_ids)) ELSE pos.title END,
  p.shift_id, coalesce(s.name, p.shift_label), p.location, p.employment_type, p.approved_hc, p.required_hc,
  b.current_hc, coalesce(sc.physical_seats, 0), b.pipeline_hc, b.selected_hc, b.joining_hc, b.notice_hc,
  p.target_date, p.priority, b.open_count, b.open_hc,
  b.group_name, p.seat_capacity_id, p.follow_desks, coalesce(tr.n, 0), tr.rd,
  greatest(b.committed_hc - greatest(b.net_need - coalesce(tr.n, 0), 0), 0)
FROM public.hr_headcount_plans p
JOIN b ON b.plan_id = p.id
LEFT JOIN tr ON tr.pid = p.id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN public.hr_seat_capacity sc ON sc.id = p.seat_capacity_id
WHERE p.is_active
$$;
GRANT EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_workforce_unplanned_scopes()
RETURNS TABLE(department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, current_hc integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT e.department_id, d.name, e.position_id, pos.title, e.group_id, s.name, count(*)::int
FROM public.hr_wf_people() e
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.positions pos ON pos.id = e.position_id
LEFT JOIN public.hr_shifts s ON s.id = e.group_id
WHERE NOT e.is_training
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_headcount_plans p
    WHERE p.is_active AND p.department_id IS NOT DISTINCT FROM e.department_id
      AND e.position_id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))
      AND (cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
           OR e.group_id = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))))
GROUP BY 1,2,3,4,5,6
$$;

CREATE OR REPLACE FUNCTION public.hr_next_hiring_requirement_no() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_next_hiring_requirement_no'));
  yr := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  SELECT coalesce(max(split_part(requirement_no, '-', 3)::int), 0) + 1 INTO seq
  FROM public.hr_hiring_requirements
  WHERE requirement_no LIKE 'HR-' || yr || '-%' AND split_part(requirement_no, '-', 3) ~ '^[0-9]+$';
  RETURN 'HR-' || yr || '-' || lpad(seq::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_refresh_requirement(p_requirement uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_filled int; v_has_job boolean; v_new text;
BEGIN
  IF p_requirement IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_requirement FOR UPDATE;
  IF NOT FOUND OR r.status IN ('draft','pending_approval','rejected','cancelled') THEN RETURN; END IF;
  SELECT coalesce(max(joined_hc), 0) INTO v_filled FROM public.hr_wf_requirement_people(p_requirement);
  v_has_job := EXISTS (SELECT 1 FROM public.ats_jobs j WHERE j.requisition_id = p_requirement AND j.status IN ('open','paused'));
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
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_progress_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_TABLE_NAME = 'ats_jobs' THEN
    v_new := NEW.requisition_id;
    IF TG_OP = 'UPDATE' THEN v_old := OLD.requisition_id; END IF;
  ELSIF TG_TABLE_NAME = 'ats_applications' THEN
    SELECT requisition_id INTO v_new FROM public.ats_jobs WHERE id = NEW.job_id;
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
      SELECT requisition_id INTO v_old FROM public.ats_jobs WHERE id = OLD.job_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_employee_onboarding' THEN
    SELECT j.requisition_id INTO v_new FROM public.ats_applications a JOIN public.ats_jobs j ON j.id = a.job_id WHERE a.id = NEW.ats_application_id;
    IF TG_OP = 'UPDATE' AND OLD.ats_application_id IS DISTINCT FROM NEW.ats_application_id THEN
      SELECT j.requisition_id INTO v_old FROM public.ats_applications a JOIN public.ats_jobs j ON j.id = a.job_id WHERE a.id = OLD.ats_application_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_hiring_requirements' THEN
    IF NEW.status = 'cancelled' THEN
      UPDATE public.ats_jobs SET status = 'closed', closed_reason = 'Hiring requirement cancelled'
       WHERE requisition_id = NEW.id AND status IN ('open','paused');
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.hr_wf_refresh_requirement(NEW.id);
    END IF;
    RETURN NULL;
  END IF;
  PERFORM public.hr_wf_refresh_requirement(v_new);
  IF v_old IS DISTINCT FROM v_new THEN PERFORM public.hr_wf_refresh_requirement(v_old); END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.ats_jobs;
CREATE TRIGGER trg_hr_wf_progress AFTER INSERT OR UPDATE OF requisition_id, status ON public.ats_jobs
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.ats_applications;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE OF status, job_id ON public.ats_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_wf_progress AFTER INSERT OR UPDATE OF status, ats_application_id, date_of_joining, employee_id ON public.hr_employee_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE OF status ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_progress_trigger();

CREATE OR REPLACE FUNCTION public.hr_trigger_reconcile_capacity_hiring() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  PERFORM public.hr_reconcile_capacity_hiring(true);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.hr_trigger_reconcile_on_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed boolean := false;
BEGIN
  IF pg_trigger_depth() > 1 OR coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'hr_employees' THEN
    SELECT EXISTS (SELECT 1 FROM wf_old o JOIN wf_new n ON n.id = o.id
      WHERE o.is_active IS DISTINCT FROM n.is_active OR o.resignation_status IS DISTINCT FROM n.resignation_status
         OR o.last_working_day IS DISTINCT FROM n.last_working_day) INTO v_changed;
  ELSIF TG_TABLE_NAME = 'hr_employee_work_info' THEN
    SELECT EXISTS (SELECT 1 FROM wf_old o JOIN wf_new n ON n.id = o.id
      WHERE o.department_id IS DISTINCT FROM n.department_id OR o.job_position_id IS DISTINCT FROM n.job_position_id
         OR o.shift_id IS DISTINCT FROM n.shift_id) INTO v_changed;
  END IF;
  IF v_changed THEN PERFORM public.hr_reconcile_capacity_hiring(true); END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_hr_employee_status_reconcile ON public.hr_employees;
CREATE TRIGGER trg_hr_employee_status_reconcile AFTER UPDATE ON public.hr_employees
  REFERENCING OLD TABLE AS wf_old NEW TABLE AS wf_new
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_on_change();
DROP TRIGGER IF EXISTS trg_hr_work_info_reconcile ON public.hr_employee_work_info;
CREATE TRIGGER trg_hr_work_info_reconcile AFTER INSERT OR DELETE ON public.hr_employee_work_info
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();
DROP TRIGGER IF EXISTS trg_hr_work_info_reconcile_update ON public.hr_employee_work_info;
CREATE TRIGGER trg_hr_work_info_reconcile_update AFTER UPDATE ON public.hr_employee_work_info
  REFERENCING OLD TABLE AS wf_old NEW TABLE AS wf_new
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_on_change();

DROP TRIGGER IF EXISTS trg_hr_headcount_plan_reconcile ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_headcount_plan_reconcile
  AFTER INSERT OR DELETE OR UPDATE OF department_id, position_id, eligible_position_ids, shift_id, eligible_shift_ids, location,
    approved_hc, required_hc, is_active, seat_capacity_id, follow_desks, target_date ON public.hr_headcount_plans
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();
DROP TRIGGER IF EXISTS trg_hr_ats_app_workforce_reconcile ON public.ats_applications;
CREATE TRIGGER trg_hr_ats_app_workforce_reconcile AFTER DELETE OR UPDATE OF status, job_id ON public.ats_applications
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();
DROP TRIGGER IF EXISTS trg_hr_ats_job_workforce_reconcile ON public.ats_jobs;
CREATE TRIGGER trg_hr_ats_job_workforce_reconcile AFTER INSERT OR DELETE OR UPDATE OF requisition_id ON public.ats_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();
DROP TRIGGER IF EXISTS trg_hr_onboarding_workforce_reconcile ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_onboarding_workforce_reconcile
  AFTER INSERT OR DELETE OR UPDATE OF status, date_of_joining, ats_application_id, department_id, position_id, shift_id,
    post_training_shift_id, training_completion_date, employee_id ON public.hr_employee_onboarding
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();
DROP TRIGGER IF EXISTS trg_hr_shift_planning_reconcile ON public.hr_shifts;
CREATE TRIGGER trg_hr_shift_planning_reconcile AFTER UPDATE OF planning_shift_id, is_training_shift ON public.hr_shifts
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();
DROP TRIGGER IF EXISTS trg_hr_position_planning_reconcile ON public.positions;
CREATE TRIGGER trg_hr_position_planning_reconcile AFTER UPDATE OF in_workforce_planning, is_active ON public.positions
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();

CREATE OR REPLACE FUNCTION public.hr_reconcile_capacity_hiring(p_sync_plans boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; pa_id uuid; pa_out int; pa_target date; other_open int; v_net int; desired int; v_target date; v_notes text;
  v_priority text; v_prev text;
  plans_synced int := 0; created int := 0; updated int := 0; cancelled int := 0; n int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));
  v_prev := coalesce(current_setting('hr.wf_reconciling', true), '');
  PERFORM set_config('hr.wf_reconciling', '1', true);

  UPDATE public.hr_headcount_plans p
     SET approved_hc = c.cap, required_hc = c.cap
    FROM (SELECT sc.id, CASE WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END AS cap
            FROM public.hr_seat_capacity sc) c
   WHERE p.seat_capacity_id = c.id AND p.follow_desks AND p.is_active
     AND (p.approved_hc IS DISTINCT FROM c.cap OR p.required_hc IS DISTINCT FROM c.cap);
  GET DIAGNOSTICS plans_synced = ROW_COUNT;

  UPDATE public.hr_hiring_requirements hr
     SET status = 'cancelled',
         notes = concat_ws(E'\n', nullif(hr.notes, ''), 'System-cancelled: its staffing line is no longer active.')
   WHERE hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
     AND NOT EXISTS (SELECT 1 FROM public.hr_headcount_plans p WHERE p.id = hr.staffing_plan_id AND p.is_active);
  GET DIAGNOSTICS n = ROW_COUNT; cancelled := cancelled + n;

  FOR m IN SELECT * FROM public.hr_workforce_staffing_matrix() LOOP
    pa_id := NULL; pa_out := 0; pa_target := NULL;
    SELECT hr.id, greatest(hr.number_required - hr.positions_filled, 0), hr.target_joining_date
      INTO pa_id, pa_out, pa_target
      FROM public.hr_hiring_requirements hr
     WHERE hr.staffing_plan_id = m.plan_id AND hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
     LIMIT 1;
    v_net := greatest(m.required_hc - m.current_hc - m.selected_hc - m.pending_joining_hc - m.in_training_hc, 0);
    other_open := greatest(m.open_requirement_hc - coalesce(pa_out, 0), 0);
    desired := greatest(v_net - other_open, 0);
    v_target := coalesce(m.target_date, pa_target, v_today + 30);
    v_priority := CASE WHEN m.required_hc > 0 AND (desired::numeric / m.required_hc) >= 0.20 THEN 'critical' ELSE m.priority END;
    v_notes := format('100%% occupancy on %s · %s: %s required, %s on roll, %s selected, %s joining, %s in training, %s already on other open requirements — %s still to hire.',
      coalesce(m.position_title, 'role'), m.shift_group_name, m.required_hc, m.current_hc, m.selected_hc,
      m.pending_joining_hc, m.in_training_hc, other_open, desired);
    IF pa_id IS NOT NULL THEN
      IF desired = 0 THEN
        UPDATE public.hr_hiring_requirements
           SET status = 'cancelled', reason_notes = v_notes,
               notes = concat_ws(E'\n', nullif(notes, ''), 'System-cancelled: the live shortage is now covered.')
         WHERE id = pa_id;
        cancelled := cancelled + 1;
      ELSE
        UPDATE public.hr_hiring_requirements
           SET number_required = desired, department_id = m.department_id, position_id = m.position_id,
               shift_id = m.shift_id, shift_label = m.shift_name, location = m.location,
               employment_type = m.employment_type, target_joining_date = v_target, priority = v_priority,
               reason_notes = v_notes
         WHERE id = pa_id AND (number_required IS DISTINCT FROM desired OR department_id IS DISTINCT FROM m.department_id
            OR position_id IS DISTINCT FROM m.position_id OR shift_id IS DISTINCT FROM m.shift_id
            OR shift_label IS DISTINCT FROM m.shift_name OR location IS DISTINCT FROM m.location
            OR employment_type IS DISTINCT FROM m.employment_type OR target_joining_date IS DISTINCT FROM v_target
            OR priority IS DISTINCT FROM v_priority OR reason_notes IS DISTINCT FROM v_notes);
        IF FOUND THEN updated := updated + 1; END IF;
      END IF;
    ELSIF desired > 0 THEN
      INSERT INTO public.hr_hiring_requirements(requirement_no, staffing_plan_id, source, department_id, position_id, shift_id,
        shift_label, location, employment_type, number_required, target_joining_date, reason, reason_notes,
        requested_by_name, approver_name, priority, status, notes)
      VALUES (public.hr_next_hiring_requirement_no(), m.plan_id, 'capacity_occupancy', m.department_id, m.position_id, m.shift_id,
        m.shift_name, m.location, m.employment_type, desired, v_target, 'increased_workload', v_notes,
        'Workforce Planning System', 'HR Manager', v_priority, 'pending_approval',
        'System-generated for an uncovered staffing shortage on this line (100% desk occupancy policy).');
      created := created + 1;
    END IF;
  END LOOP;

  PERFORM set_config('hr.wf_reconciling', v_prev, true);
  RETURN jsonb_build_object('plans_synced', plans_synced, 'plans_created', 0, 'plans_updated', plans_synced,
    'requirements_created', created, 'requirements_updated', updated, 'requirements_cancelled', cancelled);
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_audit_fill() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.changed_by := coalesce(NEW.changed_by, auth.uid());
  IF coalesce(btrim(NEW.changed_by_name), '') = '' THEN
    NEW.changed_by_name := CASE WHEN NEW.changed_by IS NULL THEN 'System' ELSE coalesce(
      (SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email)
         FROM public.users u WHERE u.id = NEW.changed_by), 'System') END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_audit_fill ON public.hr_workforce_plan_audit;
CREATE TRIGGER trg_hr_wf_audit_fill BEFORE INSERT ON public.hr_workforce_plan_audit
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_fill();

CREATE OR REPLACE FUNCTION public.hr_wf_shift_label(p_shift uuid, p_eligible uuid[]) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT string_agg(s.name, ' + ' ORDER BY s.start_time) FROM public.hr_shifts s
                    WHERE s.id = ANY(public.hr_wf_shift_groups(p_shift, p_eligible))), 'Any shift')
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_audit_headcount() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a uuid := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', OLD.id, 'Line removed', format('Approved %s / Required %s', OLD.approved_hc, OLD.required_hc), NULL, OLD.notes, a);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Plan created', NULL,
      format('%s · Approved %s / Required %s', public.hr_wf_shift_label(NEW.shift_id, NEW.eligible_shift_ids), NEW.approved_hc, NEW.required_hc), NEW.notes, a);
    RETURN NEW;
  END IF;
  IF NEW.approved_hc IS DISTINCT FROM OLD.approved_hc THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Approved HC', OLD.approved_hc::text, NEW.approved_hc::text, NEW.notes, a);
  END IF;
  IF NEW.required_hc IS DISTINCT FROM OLD.required_hc THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Required HC', OLD.required_hc::text, NEW.required_hc::text, NEW.notes, a);
  END IF;
  IF NEW.shift_id IS DISTINCT FROM OLD.shift_id OR NEW.eligible_shift_ids IS DISTINCT FROM OLD.eligible_shift_ids THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Shift', public.hr_wf_shift_label(OLD.shift_id, OLD.eligible_shift_ids),
            public.hr_wf_shift_label(NEW.shift_id, NEW.eligible_shift_ids), NEW.notes, a);
  END IF;
  IF NEW.follow_desks IS DISTINCT FROM OLD.follow_desks THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Follow desks', OLD.follow_desks::text, NEW.follow_desks::text, NEW.notes, a);
  END IF;
  IF NEW.seat_capacity_id IS DISTINCT FROM OLD.seat_capacity_id THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Desk group', OLD.seat_capacity_id::text, NEW.seat_capacity_id::text, NEW.notes, a);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, CASE WHEN NEW.is_active THEN 'Line reactivated' ELSE 'Line deactivated' END,
            OLD.is_active::text, NEW.is_active::text, NEW.notes, a);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_headcount_audit ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_headcount_audit AFTER INSERT OR UPDATE OR DELETE ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_headcount();

CREATE OR REPLACE FUNCTION public.hr_wf_audit_requirement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('hiring_requirement', NEW.id, 'Requirement created', NULL, NEW.requirement_no, coalesce(NEW.reason_notes, NEW.reason), a);
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Status', OLD.status, NEW.status, coalesce(NEW.rejection_reason, NEW.notes), a);
    END IF;
    IF NEW.number_required IS DISTINCT FROM OLD.number_required THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Number required', OLD.number_required::text, NEW.number_required::text, coalesce(NEW.reason_notes, NEW.notes), a);
    END IF;
    IF NEW.target_joining_date IS DISTINCT FROM OLD.target_joining_date THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Target joining date', OLD.target_joining_date::text, NEW.target_joining_date::text, NEW.notes, a);
    END IF;
    IF NEW.shift_id IS DISTINCT FROM OLD.shift_id THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Shift', OLD.shift_label, NEW.shift_label, NEW.notes, a);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_audit_seat_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('seat_capacity', NEW.id, 'Desk group created', NULL,
      format('%s desks, operational %s%s', NEW.physical_seats, coalesce(NEW.max_operational_capacity::text, '—'),
             CASE WHEN NEW.is_training_only THEN ', training only' ELSE '' END), NEW.notes, a);
    RETURN NEW;
  END IF;
  IF NEW.physical_seats IS DISTINCT FROM OLD.physical_seats THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('seat_capacity', NEW.id, 'Desks', OLD.physical_seats::text, NEW.physical_seats::text, NEW.notes, a);
  END IF;
  IF NEW.max_operational_capacity IS DISTINCT FROM OLD.max_operational_capacity THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('seat_capacity', NEW.id, 'Operational capacity', OLD.max_operational_capacity::text, NEW.max_operational_capacity::text, NEW.notes, a);
  END IF;
  IF NEW.is_training_only IS DISTINCT FROM OLD.is_training_only THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('seat_capacity', NEW.id, 'Training only', OLD.is_training_only::text, NEW.is_training_only::text, NEW.notes, a);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('seat_capacity', NEW.id, CASE WHEN NEW.is_active THEN 'Desk group reactivated' ELSE 'Desk group deactivated' END,
            OLD.is_active::text, NEW.is_active::text, NEW.notes, a);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_seat_capacity_audit ON public.hr_seat_capacity;
CREATE TRIGGER trg_hr_seat_capacity_audit AFTER INSERT OR UPDATE ON public.hr_seat_capacity
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_seat_capacity();

REVOKE EXECUTE ON FUNCTION public.hr_wf_people(), public.hr_wf_requirement_people(uuid), public.hr_wf_line_base(),
  public.hr_wf_trainee_allocation(), public.hr_wf_refresh_requirement(uuid)
  FROM PUBLIC, anon, authenticated;