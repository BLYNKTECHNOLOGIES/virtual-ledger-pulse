-- ===================== WF7 §1 · automatic priority =====================
ALTER TABLE public.hr_headcount_plans ALTER COLUMN priority DROP NOT NULL;
ALTER TABLE public.hr_headcount_plans ALTER COLUMN priority SET DEFAULT NULL;
ALTER TABLE public.hr_headcount_plans DROP CONSTRAINT IF EXISTS hr_headcount_plans_priority_chk;
ALTER TABLE public.hr_headcount_plans ADD CONSTRAINT hr_headcount_plans_priority_chk
  CHECK (priority IS NULL OR priority IN ('critical','high','medium','low'));

CREATE OR REPLACE FUNCTION public.hr_wf_priority_rule(p_required int, p_net int, p_staffed int, p_target date, p_today date,
  OUT priority text, OUT why text)
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE d int := CASE WHEN p_target IS NULL THEN NULL ELSE p_target - p_today END;
  t text := CASE WHEN d IS NULL THEN NULL WHEN d < 0 THEN format('target joining date passed %s day%s ago', -d, CASE WHEN d = -1 THEN '' ELSE 's' END)
                 WHEN d = 0 THEN 'target joining date is today'
                 ELSE format('target joining date in %s day%s', d, CASE WHEN d = 1 THEN '' ELSE 's' END) END;
BEGIN
  IF coalesce(p_net, 0) <= 0 THEN priority := 'low'; why := 'no one needed';
  ELSIF d IS NOT NULL AND d <= 7 THEN priority := 'critical'; why := t;
  ELSIF coalesce(p_staffed, 0) = 0 AND coalesce(p_required, 0) > 0 AND d IS NULL THEN priority := 'critical'; why := 'nobody on this line yet';
  ELSIF p_net * 2 >= coalesce(p_required, 0) THEN priority := 'high'; why := format('%s of %s still needed', p_net, p_required);
  ELSIF d IS NOT NULL AND d <= 15 THEN priority := 'high'; why := t;
  ELSE priority := 'medium'; why := format('%s of %s still needed', p_net, p_required);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.hr_workforce_staffing_matrix();
DROP FUNCTION IF EXISTS public.hr_wf_staffing_matrix_core();

CREATE FUNCTION public.hr_wf_staffing_matrix_core()
 RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer, shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date, over_requested_hc integer, operational_capacity integer, seat_active boolean, auto_paused_at timestamp with time zone, auto_paused_by_name text, auto_paused_reason text, auto_paused_need integer, replacement_cover_hc integer,
   priority_auto text, priority_pinned text, priority_why text, role_ids uuid[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH b AS MATERIALIZED (SELECT * FROM public.hr_wf_line_base()),
tr AS (SELECT out_plan_id AS pid, count(*)::int AS n, min(out_ready_date) AS rd
       FROM public.hr_wf_trainee_allocation_from((SELECT coalesce(jsonb_agg(to_jsonb(bb)), '[]'::jsonb) FROM b bb)) GROUP BY 1),
rep AS (
  SELECT hr.staffing_plan_id AS pid, count(DISTINCT hr.replacement_employee_id)::int AS n
  FROM public.hr_hiring_requirements hr
  JOIN public.hr_employees e ON e.id = hr.replacement_employee_id AND e.is_active AND e.resignation_status = 'notice_period'
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('approved','recruitment_active','partially_fulfilled')
  GROUP BY 1
),
rc AS (
  SELECT hr.staffing_plan_id AS pid,
    sum(greatest(hr.number_required - hr.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0))::int AS n
  FROM public.hr_hiring_requirements hr
  JOIN public.hr_employees e ON e.id = hr.replacement_employee_id AND e.is_active AND e.resignation_status = 'notice_period'
  LEFT JOIN LATERAL public.hr_wf_requirement_people(hr.id) rp ON true
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
  GROUP BY 1
),
tg AS (
  SELECT hr.staffing_plan_id AS pid, min(hr.target_joining_date) AS d
  FROM public.hr_hiring_requirements hr
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
  GROUP BY 1
),
z AS (
  SELECT p.*, b.current_hc AS b_cur, b.pipeline_hc AS b_pipe, b.selected_hc AS b_sel, b.joining_hc AS b_jn, b.notice_hc AS b_notice,
    b.open_count AS b_oc, b.open_hc AS b_oh, b.committed_hc AS b_comm, b.net_need AS b_net, b.group_name AS b_group, b.roles AS b_roles,
    coalesce(tr.n, 0) AS tr_n, tr.rd AS tr_rd, rep.n AS rep_n, rc.n AS rc_n,
    public.hr_wf_priority_rule(p.required_hc,
      greatest(p.required_hc - b.current_hc - b.selected_hc - b.joining_hc - coalesce(tr.n, 0), 0),
      b.current_hc + coalesce(tr.n, 0), coalesce(tg.d, p.target_date), (now() AT TIME ZONE 'Asia/Kolkata')::date) AS pr
  FROM public.hr_headcount_plans p
  JOIN b ON b.plan_id = p.id
  LEFT JOIN tr ON tr.pid = p.id
  LEFT JOIN rep ON rep.pid = p.id
  LEFT JOIN rc ON rc.pid = p.id
  LEFT JOIN tg ON tg.pid = p.id
  WHERE p.is_active
)
SELECT z.id, z.department_id, d.name, z.position_id,
  CASE WHEN cardinality(z.eligible_position_ids) > 1 THEN (
    SELECT string_agg(pos2.title, ' / ' ORDER BY array_position(z.eligible_position_ids, pos2.id))
    FROM public.positions pos2 WHERE pos2.id = ANY(z.eligible_position_ids)) ELSE pos.title END,
  z.shift_id, coalesce(s.name, z.shift_label), z.location, z.employment_type, z.approved_hc, z.required_hc,
  z.b_cur, coalesce(sc.physical_seats, 0), z.b_pipe, z.b_sel, z.b_jn, z.b_notice,
  z.target_date, coalesce(z.priority, (z.pr).priority), z.b_oc, z.b_oh,
  z.b_group, z.seat_capacity_id, z.follow_desks, z.tr_n, z.tr_rd,
  greatest(z.b_comm - greatest(z.b_net - z.tr_n, 0) - least(z.b_notice, coalesce(z.rep_n, 0)), 0),
  CASE WHEN sc.id IS NULL THEN NULL WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END,
  sc.is_active, z.auto_paused_at, z.auto_paused_by_name, z.auto_paused_reason, z.auto_paused_need,
  least(z.b_notice, coalesce(z.rc_n, 0)),
  (z.pr).priority, z.priority, CASE WHEN z.priority IS NOT NULL THEN 'set by HR' ELSE (z.pr).why END,
  CASE WHEN z.position_id IS NOT NULL AND z.position_id = ANY(z.b_roles)
       THEN ARRAY[z.position_id] || array_remove(z.b_roles, z.position_id) ELSE z.b_roles END
FROM z
LEFT JOIN public.departments d ON d.id = z.department_id
LEFT JOIN public.positions pos ON pos.id = z.position_id
LEFT JOIN public.hr_shifts s ON s.id = z.shift_id
LEFT JOIN public.hr_seat_capacity sc ON sc.id = z.seat_capacity_id
$function$;
REVOKE ALL ON FUNCTION public.hr_wf_staffing_matrix_core() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_wf_staffing_matrix_core() TO service_role;

CREATE FUNCTION public.hr_workforce_staffing_matrix()
 RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer, shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date, over_requested_hc integer, operational_capacity integer, seat_active boolean, auto_paused_at timestamp with time zone, auto_paused_by_name text, auto_paused_reason text, auto_paused_need integer, replacement_cover_hc integer,
   priority_auto text, priority_pinned text, priority_why text, role_ids uuid[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    #variable_conflict use_column
    BEGIN
      IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR staff can view workforce planning' USING ERRCODE = '42501'; END IF;
      RETURN QUERY SELECT * FROM public.hr_wf_staffing_matrix_core();
    END $function$;
REVOKE ALL ON FUNCTION public.hr_workforce_staffing_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix() TO authenticated, service_role;

-- A request created on (or moved onto) a line takes the line's priority.
CREATE OR REPLACE FUNCTION public.hr_wf_requirement_line_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text;
BEGIN
  IF NEW.staffing_plan_id IS NULL OR coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.staffing_plan_id IS NOT DISTINCT FROM OLD.staffing_plan_id THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN RETURN NEW; END IF;
  SELECT m.priority INTO v FROM public.hr_wf_staffing_matrix_core() m WHERE m.plan_id = NEW.staffing_plan_id;
  IF v IS NOT NULL THEN NEW.priority := v; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_requirement_line_priority() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_zline_priority ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_zline_priority BEFORE INSERT OR UPDATE OF staffing_plan_id ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_requirement_line_priority();

-- Plan history: priority on lines and requests.
CREATE OR REPLACE FUNCTION public.hr_wf_audit_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_r text := nullif(current_setting('hr.wf_change_reason', true), '');
  a uuid := CASE WHEN coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN NULL ELSE auth.uid() END;
BEGIN
  IF NEW.priority IS NOT DISTINCT FROM OLD.priority THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'hr_headcount_plans' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Priority', coalesce(initcap(OLD.priority), 'Automatic'), coalesce(initcap(NEW.priority), 'Automatic'),
      coalesce(v_r, CASE WHEN NEW.priority IS NULL THEN format('Priority now automatic (was %s)', initcap(OLD.priority))
                         ELSE format('Priority pinned to %s', initcap(NEW.priority)) END), a);
  ELSE
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('hiring_requirement', NEW.id, 'Priority', initcap(OLD.priority), initcap(NEW.priority),
      coalesce(v_r, CASE WHEN NEW.staffing_plan_id IS NOT NULL THEN 'Follows its staffing line''s priority' END), a);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_audit_priority() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_audit_priority ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_wf_audit_priority AFTER UPDATE OF priority ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_priority();
DROP TRIGGER IF EXISTS trg_hr_wf_audit_priority ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_audit_priority AFTER UPDATE OF priority ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_priority();

-- Reconcile: create with the line's priority and keep open line-linked requests in step.
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.hr_reconcile_capacity_hiring(boolean)'::regprocedure);
  src := replace(src,
$a$    v_priority := CASE WHEN m.required_hc > 0 AND v_net::numeric / m.required_hc >= 0.5 THEN 'critical'
                       WHEN m.required_hc > 0 AND v_net::numeric / m.required_hc >= 0.2 THEN 'high'
                       ELSE 'medium' END;$a$,
$b$    v_priority := m.priority;
    UPDATE public.hr_hiring_requirements hr SET priority = m.priority
     WHERE hr.staffing_plan_id = m.plan_id AND m.priority IS NOT NULL
       AND hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
       AND hr.priority IS DISTINCT FROM m.priority
       AND hr.id IN (SELECT q.id FROM public.hr_hiring_requirements q WHERE q.staffing_plan_id = m.plan_id FOR UPDATE SKIP LOCKED);$b$);
  IF position('v_priority := m.priority' in src) = 0 THEN RAISE EXCEPTION 'reconcile priority block not found'; END IF;
  EXECUTE src;
END $do$;

-- ===================== WF7 §2 · planning status =====================
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS wf_no_line_ok_at timestamptz, ADD COLUMN IF NOT EXISTS wf_no_line_ok_by uuid;

CREATE OR REPLACE FUNCTION public.hr_wf_position_status_core()
RETURNS TABLE(position_id uuid, status text, line_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pos.id,
    CASE WHEN NOT pos.in_workforce_planning THEN 'outside'
         WHEN l.n > 0 THEN 'planned'
         WHEN pos.wf_no_line_ok_at IS NOT NULL THEN 'no_staff_needed'
         ELSE 'undecided' END,
    l.n
  FROM public.positions pos
  CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM public.hr_headcount_plans p
                       WHERE p.is_active AND pos.id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))) l
$$;
REVOKE ALL ON FUNCTION public.hr_wf_position_status_core() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_position_planning_status()
RETURNS TABLE(position_id uuid, status text, line_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL AND NOT public.hr_wf_caller_is_internal() THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.hr_wf_position_status_core();
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_position_planning_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_position_planning_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_wf_assert_role_planned(p_position uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_title text; v_in boolean;
BEGIN
  IF p_position IS NULL THEN RETURN; END IF;
  SELECT title, in_workforce_planning INTO v_title, v_in FROM public.positions WHERE id = p_position;
  IF NOT FOUND OR NOT v_in THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.hr_headcount_plans p WHERE p.is_active
              AND p_position = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))) THEN RETURN; END IF;
  RAISE EXCEPTION '% has no staffing line. Plan its lines in Workforce Planning, or take it out of workforce planning, before hiring for it.', v_title
    USING HINT = 'HR_WF_ROLE_NOT_PLANNED';
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_assert_role_planned(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_requirement_role_planned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.hr_wf_assert_role_planned(NEW.position_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_requirement_role_planned() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a0a_hr_wf_role_planned ON public.hr_hiring_requirements;
CREATE TRIGGER a0a_hr_wf_role_planned BEFORE INSERT ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_requirement_role_planned();

CREATE OR REPLACE FUNCTION public.ats_jobs_role_planned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(current_setting('hr.wf_position_moving', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.position_id IS NULL OR NEW.status = 'closed' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR OLD.status = 'closed' OR NEW.position_id IS DISTINCT FROM OLD.position_id THEN
    PERFORM public.hr_wf_assert_role_planned(NEW.position_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ats_jobs_role_planned() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ats_jobs_role_planned ON public.ats_jobs;
CREATE TRIGGER ats_jobs_role_planned BEFORE INSERT OR UPDATE OF status, position_id ON public.ats_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ats_jobs_role_planned();

-- HRMS managers mark a role "in planning, no staff needed now".
CREATE OR REPLACE FUNCTION public.hr_wf_set_no_staff_needed(p_position uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT private.hr_wf_is_current_manager() THEN RAISE EXCEPTION 'Only HRMS managers can decide workforce planning for a role' USING ERRCODE = '42501'; END IF;
  IF p_on AND EXISTS (SELECT 1 FROM public.hr_headcount_plans p WHERE p.is_active
                       AND p_position = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))) THEN
    RAISE EXCEPTION 'This role already has staffing lines';
  END IF;
  PERFORM set_config('hr.wf_internal', '1', true);
  UPDATE public.positions
     SET wf_no_line_ok_at = CASE WHEN p_on THEN now() END, wf_no_line_ok_by = CASE WHEN p_on THEN auth.uid() END
   WHERE id = p_position;
  PERFORM set_config('hr.wf_internal', '', true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown position'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_set_no_staff_needed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_set_no_staff_needed(uuid, boolean) TO authenticated, service_role;

-- Adding (or reactivating) a line clears "no staff needed now" for its roles.
CREATE OR REPLACE FUNCTION public.hr_wf_line_clears_no_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT NEW.is_active THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.positions WHERE id = ANY(public.hr_wf_roles(NEW.position_id, NEW.eligible_position_ids)) AND wf_no_line_ok_at IS NOT NULL) THEN
    PERFORM set_config('hr.wf_internal', '1', true);
    UPDATE public.positions SET wf_no_line_ok_at = NULL, wf_no_line_ok_by = NULL
     WHERE id = ANY(public.hr_wf_roles(NEW.position_id, NEW.eligible_position_ids)) AND wf_no_line_ok_at IS NOT NULL;
    PERFORM set_config('hr.wf_internal', '', true);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_line_clears_no_staff() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_line_clears_no_staff ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_wf_line_clears_no_staff AFTER INSERT OR UPDATE OF is_active, position_id, eligible_position_ids ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_line_clears_no_staff();

-- ===================== WF7 §3 · position moves =====================
CREATE OR REPLACE FUNCTION public.hr_wf_position_move_counts(p_position uuid, p_old_department uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'lines', (SELECT count(*) FROM public.hr_headcount_plans p WHERE p.department_id IS NOT DISTINCT FROM p_old_department
               AND public.hr_wf_roles(p.position_id, p.eligible_position_ids) = ARRAY[p_position]),
    'desk_groups', (SELECT count(*) FROM public.hr_seat_capacity s WHERE s.department_id IS NOT DISTINCT FROM p_old_department
               AND public.hr_wf_roles(s.position_id, s.eligible_position_ids) = ARRAY[p_position]),
    'requests', (SELECT count(*) FROM public.hr_hiring_requirements r WHERE r.position_id = p_position
               AND r.department_id IS NOT DISTINCT FROM p_old_department
               AND r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')),
    'jobs', (SELECT count(*) FROM public.ats_jobs j WHERE j.position_id = p_position
               AND j.department_id IS NOT DISTINCT FROM p_old_department AND j.status IN ('draft','open','paused')),
    'people', (SELECT count(*) FROM public.hr_employee_work_info w JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active
               WHERE w.job_position_id = p_position AND w.department_id IS NOT DISTINCT FROM p_old_department),
    'onboarding', (SELECT count(*) FROM public.hr_employee_onboarding o WHERE o.position_id = p_position
               AND o.department_id IS NOT DISTINCT FROM p_old_department AND o.status = 'draft'),
    'users', (SELECT count(*) FROM public.users u WHERE u.position_id = p_position AND u.department_id IS NOT DISTINCT FROM p_old_department))
$$;
REVOKE ALL ON FUNCTION public.hr_wf_position_move_counts(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_position_move_refusal(p_position uuid, p_old_department uuid, p_new_department uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_title text; v_dept text; v_active boolean; v text;
BEGIN
  SELECT title INTO v_title FROM public.positions WHERE id = p_position;
  IF p_new_department IS NOT NULL THEN
    SELECT name, is_active INTO v_dept, v_active FROM public.departments WHERE id = p_new_department;
    IF v_dept IS NULL THEN RETURN 'That department does not exist'; END IF;
    IF NOT coalesce(v_active, true) THEN RETURN format('%s is inactive; activate it before moving a position into it.', v_dept); END IF;
  END IF;
  SELECT format('%s shares the %s line with %s; change that line first', v_title,
           public.hr_wf_shift_label(p.shift_id, p.eligible_shift_ids),
           (SELECT string_agg(o.title, ' / ' ORDER BY o.title) FROM public.positions o
             WHERE o.id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids)) AND o.id <> p_position))
    INTO v
    FROM public.hr_headcount_plans p
   WHERE p.is_active AND p.department_id IS NOT DISTINCT FROM p_old_department
     AND p_position = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))
     AND cardinality(public.hr_wf_roles(p.position_id, p.eligible_position_ids)) > 1
   LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT format('%s shares the %s desk group with %s; change that desk group first', v_title,
           coalesce((SELECT name FROM public.hr_shifts WHERE id = s.shift_id), s.shift_label, 'any shift'),
           (SELECT string_agg(o.title, ' / ' ORDER BY o.title) FROM public.positions o
             WHERE o.id = ANY(s.eligible_position_ids) AND o.id <> p_position))
    INTO v
    FROM public.hr_seat_capacity s
   WHERE s.is_active AND s.department_id IS NOT DISTINCT FROM p_old_department
     AND p_position = ANY(s.eligible_position_ids) AND cardinality(s.eligible_position_ids) > 1
   LIMIT 1;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_position_move_refusal(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_position_move_preview(p_position uuid, p_new_department uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old uuid; c jsonb;
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.hr_wf_caller_is_internal()) THEN RAISE EXCEPTION 'Only HR staff can preview a position move' USING ERRCODE = '42501'; END IF;
  SELECT department_id INTO v_old FROM public.positions WHERE id = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown position'; END IF;
  IF v_old IS NOT DISTINCT FROM p_new_department THEN
    RETURN jsonb_build_object('lines',0,'desk_groups',0,'requests',0,'jobs',0,'people',0,'onboarding',0,'users',0,'total',0,'refusal',NULL,'can_move',true);
  END IF;
  c := public.hr_wf_position_move_counts(p_position, v_old);
  RETURN c || jsonb_build_object(
    'total', (c->>'lines')::int + (c->>'desk_groups')::int + (c->>'requests')::int + (c->>'jobs')::int + (c->>'people')::int + (c->>'onboarding')::int,
    'refusal', public.hr_wf_position_move_refusal(p_position, v_old, p_new_department),
    'can_move', private.hr_wf_is_current_manager()
       OR ((c->>'lines')::int + (c->>'desk_groups')::int + (c->>'requests')::int + (c->>'jobs')::int + (c->>'people')::int + (c->>'onboarding')::int) = 0);
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_position_move_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_position_move_preview(uuid, uuid) TO authenticated, service_role;

-- Position guard: planning switches, "no staff needed", leaving planning with live hiring, department moves.
CREATE OR REPLACE FUNCTION public.hr_wf_position_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int; v text; c jsonb; v_mgr boolean;
BEGIN
  v_mgr := public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(auth.uid());
  IF OLD.in_workforce_planning IS DISTINCT FROM NEW.in_workforce_planning OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    IF NOT v_mgr THEN
      RAISE EXCEPTION 'Only HRMS managers can change whether a position is in workforce planning or tentative';
    END IF;
  END IF;
  IF (OLD.wf_no_line_ok_at IS DISTINCT FROM NEW.wf_no_line_ok_at OR OLD.wf_no_line_ok_by IS DISTINCT FROM NEW.wf_no_line_ok_by)
     AND coalesce(current_setting('hr.wf_internal', true), '') <> '1' AND NOT public.hr_wf_caller_is_internal() THEN
    RAISE EXCEPTION 'Use "In planning, no staff needed now" to change this';
  END IF;
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT count(*) INTO n FROM public.hr_employee_work_info w JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active
     WHERE w.job_position_id = NEW.id;
    IF n > 0 THEN
      RAISE EXCEPTION '% is held by % active employee(s). Move them to another role before marking it tentative.', NEW.title, n;
    END IF;
  END IF;
  IF (OLD.in_workforce_planning AND NOT NEW.in_workforce_planning) OR (OLD.is_active AND NOT NEW.is_active) THEN
    SELECT string_agg(x, ', ' ORDER BY x) INTO v FROM (
      SELECT coalesce(r.requirement_no, 'a draft request') || ' (' || replace(r.status, '_', ' ') || ')' AS x
        FROM public.hr_hiring_requirements r
        LEFT JOIN public.hr_headcount_plans p ON p.id = r.staffing_plan_id
       WHERE r.status IN ('approved','recruitment_active','partially_fulfilled')
         AND (r.position_id = NEW.id OR (p.id IS NOT NULL AND NEW.id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))
                                         AND cardinality(public.hr_wf_roles(p.position_id, p.eligible_position_ids)) = 1))
      UNION ALL
      SELECT coalesce(j.job_code, j.title) || ' (' || j.status || ' job)' FROM public.ats_jobs j
       WHERE j.position_id = NEW.id AND j.status IN ('draft','open','paused')) s;
    IF v IS NOT NULL THEN
      RAISE EXCEPTION '% still has live hiring: %. Close or move them first.', NEW.title, v;
    END IF;
  END IF;
  IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
    v := public.hr_wf_position_move_refusal(NEW.id, OLD.department_id, NEW.department_id);
    IF v IS NOT NULL THEN RAISE EXCEPTION '%', v USING HINT = 'HR_WF_POSITION_MOVE_REFUSED'; END IF;
    c := public.hr_wf_position_move_counts(NEW.id, OLD.department_id);
    IF NOT v_mgr AND ((c->>'lines')::int + (c->>'desk_groups')::int + (c->>'requests')::int + (c->>'jobs')::int
                      + (c->>'people')::int + (c->>'onboarding')::int) > 0 THEN
      RAISE EXCEPTION 'Only HRMS managers can move a position that has staffing lines, desk groups, requests, jobs or people' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_wf_position_move_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_reason text; v_old text; v_new text; a uuid := auth.uid(); j record; rid uuid;
  v_jobs uuid[]; v_reqs uuid[];
BEGIN
  IF OLD.department_id IS NOT DISTINCT FROM NEW.department_id THEN RETURN NULL; END IF;
  SELECT name INTO v_old FROM public.departments WHERE id = OLD.department_id;
  SELECT name INTO v_new FROM public.departments WHERE id = NEW.department_id;
  v_reason := format('Position moved from %s to %s', coalesce(v_old, 'no department'), coalesce(v_new, 'no department'));
  PERFORM set_config('hr.wf_position_moving', '1', true);
  PERFORM set_config('hr.wf_change_reason', v_reason, true);

  WITH u AS (UPDATE public.hr_headcount_plans p SET department_id = NEW.department_id
              WHERE p.department_id IS NOT DISTINCT FROM OLD.department_id
                AND public.hr_wf_roles(p.position_id, p.eligible_position_ids) = ARRAY[NEW.id] RETURNING p.id)
  INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
  SELECT 'headcount_plan', u.id, 'Department', v_old, v_new, v_reason, a FROM u;

  WITH u AS (UPDATE public.hr_seat_capacity s SET department_id = NEW.department_id
              WHERE s.department_id IS NOT DISTINCT FROM OLD.department_id
                AND public.hr_wf_roles(s.position_id, s.eligible_position_ids) = ARRAY[NEW.id] RETURNING s.id)
  INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
  SELECT 'seat_capacity', u.id, 'Department', v_old, v_new, v_reason, a FROM u;

  WITH u AS (UPDATE public.hr_hiring_requirements r SET department_id = NEW.department_id
              WHERE r.position_id = NEW.id AND r.department_id IS NOT DISTINCT FROM OLD.department_id
                AND r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') RETURNING r.id),
       au AS (INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
              SELECT 'hiring_requirement', u.id, 'Department', v_old, v_new, v_reason, a FROM u RETURNING entity_id)
  SELECT array_agg(entity_id) INTO v_reqs FROM au;

  WITH u AS (UPDATE public.ats_jobs t SET department_id = NEW.department_id
              WHERE t.position_id = NEW.id AND t.department_id IS NOT DISTINCT FROM OLD.department_id
                AND t.status IN ('draft','open','paused') RETURNING t.id),
       ev AS (INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
              SELECT u.id, 'job_department', v_reason, jsonb_build_object('from', OLD.department_id, 'to', NEW.department_id),
                     coalesce(public.hr_wf_user_name(a), 'System') FROM u RETURNING job_id)
  SELECT array_agg(job_id) INTO v_jobs FROM ev;

  WITH u AS (UPDATE public.hr_employee_work_info w SET department_id = NEW.department_id
              FROM public.hr_employees e
              WHERE e.id = w.employee_id AND e.is_active AND w.job_position_id = NEW.id
                AND w.department_id IS NOT DISTINCT FROM OLD.department_id RETURNING w.employee_id)
  INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
  SELECT 'employee', u.employee_id, 'Department', v_old, v_new, v_reason, a FROM u;

  WITH u AS (UPDATE public.hr_employee_onboarding o SET department_id = NEW.department_id
              WHERE o.position_id = NEW.id AND o.department_id IS NOT DISTINCT FROM OLD.department_id AND o.status = 'draft' RETURNING o.id)
  INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
  SELECT 'onboarding', u.id, 'Department', v_old, v_new, v_reason, a FROM u;

  WITH u AS (UPDATE public.users x SET department_id = NEW.department_id
              WHERE x.position_id = NEW.id AND x.department_id IS NOT DISTINCT FROM OLD.department_id RETURNING x.id)
  INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
  SELECT 'user', u.id, 'Department', v_old, v_new, v_reason, a FROM u;

  -- End state must pass the job ↔ requirement checks.
  FOR j IN SELECT aj.* FROM public.ats_jobs aj
            WHERE aj.status IN ('open','paused','draft')
              AND (aj.id = ANY(coalesce(v_jobs, '{}'))
                   OR aj.requisition_id = ANY(coalesce(v_reqs, '{}'))
                   OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = aj.id AND jr.requirement_id = ANY(coalesce(v_reqs, '{}')))) LOOP
    FOR rid IN SELECT public.ats_job_requirement_ids(j.id) LOOP
      PERFORM public.ats_validate_job_requirement(j.department_id, j.position_id, j.shift_ids, rid, false);
    END LOOP;
  END LOOP;

  PERFORM set_config('hr.wf_position_moving', '', true);
  PERFORM set_config('hr.wf_change_reason', '', true);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_position_move_apply() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_position_move ON public.positions;
CREATE TRIGGER trg_hr_wf_position_move AFTER UPDATE OF department_id ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_position_move_apply();

-- WF6 checks honour the in-move flag (end state is validated by the move itself).
CREATE OR REPLACE FUNCTION public.ats_job_requirements_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE j public.ats_jobs%ROWTYPE;
BEGIN
  IF coalesce(current_setting('hr.wf_position_moving', true), '') = '1' THEN RETURN NEW; END IF;
  SELECT * INTO j FROM public.ats_jobs WHERE id = NEW.job_id;
  IF j.id IS NULL THEN RAISE EXCEPTION 'Unknown job or requirement'; END IF;
  IF j.status = 'closed' THEN RETURN NEW; END IF;
  PERFORM public.ats_validate_job_requirement(j.department_id, j.position_id, j.shift_ids, NEW.requirement_id,
    TG_OP = 'INSERT' OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.ats_jobs_requisition_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_setting('hr.wf_position_moving', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.requisition_id IS NULL OR NEW.status = 'closed' THEN RETURN NEW; END IF;
  PERFORM public.ats_validate_job_requirement(NEW.department_id, NEW.position_id, NEW.shift_ids, NEW.requisition_id,
    TG_OP = 'INSERT' OR NEW.requisition_id IS DISTINCT FROM OLD.requisition_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_wf_requirement_line_jobs_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE j record;
BEGIN
  IF coalesce(current_setting('hr.wf_reconciling', true), '') = '1' OR coalesce(current_setting('hr.wf_position_moving', true), '') = '1'
     OR NEW.status IN ('cancelled','rejected','fulfilled') THEN RETURN NEW; END IF;
  FOR j IN SELECT aj.* FROM public.ats_jobs aj WHERE aj.status IN ('open','paused')
             AND (aj.requisition_id = NEW.id OR EXISTS (SELECT 1 FROM public.ats_job_requirements jr WHERE jr.job_id = aj.id AND jr.requirement_id = NEW.id)) LOOP
    PERFORM public.ats_validate_job_requirement_core(j.department_id, j.position_id, j.shift_ids,
      NEW.requirement_no, NEW.status, NEW.department_id, NEW.position_id, NEW.staffing_plan_id, false);
  END LOOP;
  RETURN NEW;
END $function$;

-- Delete / deactivate guards.
CREATE OR REPLACE FUNCTION public.hr_wf_scope_live_counts(p_department uuid, p_position uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT nullif(concat_ws(', ',
    CASE WHEN l > 0 THEN l || ' active staffing line' || CASE WHEN l = 1 THEN '' ELSE 's' END END,
    CASE WHEN d > 0 THEN d || ' desk group' || CASE WHEN d = 1 THEN '' ELSE 's' END END,
    CASE WHEN r > 0 THEN r || ' open request' || CASE WHEN r = 1 THEN '' ELSE 's' END END,
    CASE WHEN j > 0 THEN j || ' draft/open/paused job' || CASE WHEN j = 1 THEN '' ELSE 's' END END,
    CASE WHEN e > 0 THEN e || ' active ' || CASE WHEN e = 1 THEN 'person' ELSE 'people' END END), '')
  FROM (SELECT
    (SELECT count(*) FROM public.hr_headcount_plans p WHERE p.is_active
       AND (p_department IS NULL OR p.department_id = p_department)
       AND (p_position IS NULL OR p_position = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids)))) l,
    (SELECT count(*) FROM public.hr_seat_capacity s WHERE s.is_active
       AND (p_department IS NULL OR s.department_id = p_department)
       AND (p_position IS NULL OR p_position = ANY(public.hr_wf_roles(s.position_id, s.eligible_position_ids)))) d,
    (SELECT count(*) FROM public.hr_hiring_requirements r WHERE r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')
       AND (p_department IS NULL OR r.department_id = p_department) AND (p_position IS NULL OR r.position_id = p_position)) r,
    (SELECT count(*) FROM public.ats_jobs t WHERE t.status IN ('draft','open','paused')
       AND (p_department IS NULL OR t.department_id = p_department) AND (p_position IS NULL OR t.position_id = p_position)) j,
    (SELECT count(*) FROM public.hr_employee_work_info w JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active
       AND coalesce(e.resignation_status, '') <> 'completed'
       WHERE (p_department IS NULL OR w.department_id = p_department) AND (p_position IS NULL OR w.job_position_id = p_position)) e) c
$$;
REVOKE ALL ON FUNCTION public.hr_wf_scope_live_counts(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_position_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text;
BEGIN
  v := public.hr_wf_scope_live_counts(NULL, OLD.id);
  IF v IS NOT NULL THEN RAISE EXCEPTION '% cannot be deleted while it has %.', OLD.title, v USING HINT = 'HR_WF_SCOPE_IN_USE'; END IF;
  -- Drop it from other lines' and desk groups' role lists.
  UPDATE public.hr_headcount_plans p
     SET eligible_position_ids = CASE WHEN cardinality(array_remove(p.eligible_position_ids, OLD.id)) > 1 THEN array_remove(p.eligible_position_ids, OLD.id) ELSE '{}'::uuid[] END,
         position_id = CASE WHEN p.position_id = OLD.id THEN (array_remove(p.eligible_position_ids, OLD.id))[1] ELSE p.position_id END
   WHERE OLD.id = ANY(p.eligible_position_ids) AND cardinality(array_remove(p.eligible_position_ids, OLD.id)) > 0;
  UPDATE public.hr_seat_capacity s
     SET eligible_position_ids = CASE WHEN cardinality(array_remove(s.eligible_position_ids, OLD.id)) > 1 THEN array_remove(s.eligible_position_ids, OLD.id) ELSE '{}'::uuid[] END,
         position_id = CASE WHEN s.position_id = OLD.id THEN (array_remove(s.eligible_position_ids, OLD.id))[1] ELSE s.position_id END
   WHERE OLD.id = ANY(s.eligible_position_ids);
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_position_delete_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_position_delete_guard ON public.positions;
CREATE TRIGGER trg_hr_wf_position_delete_guard BEFORE DELETE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_position_delete_guard();

CREATE OR REPLACE FUNCTION public.hr_wf_department_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (coalesce(OLD.is_active, true) AND NOT coalesce(NEW.is_active, true)) THEN RETURN NEW; END IF;
  v := public.hr_wf_scope_live_counts(OLD.id, NULL);
  IF v IS NOT NULL THEN
    RAISE EXCEPTION '% cannot be % while it has %.', OLD.name, CASE WHEN TG_OP = 'DELETE' THEN 'deleted' ELSE 'made inactive' END, v
      USING HINT = 'HR_WF_SCOPE_IN_USE';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_department_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_department_guard ON public.departments;
CREATE TRIGGER trg_hr_wf_department_guard BEFORE DELETE OR UPDATE OF is_active ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_department_guard();

-- ===================== WF7 §4 · renames =====================
CREATE OR REPLACE FUNCTION public.hr_wf_shift_rename()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name OR OLD.name IS NULL THEN RETURN NULL; END IF;
  UPDATE public.hr_headcount_plans SET shift_label = NEW.name WHERE shift_label = OLD.name;
  UPDATE public.hr_hiring_requirements SET shift_label = NEW.name WHERE shift_label = OLD.name;
  UPDATE public.hr_seat_capacity SET shift_label = NEW.name WHERE shift_label = OLD.name;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_shift_rename() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_shift_rename ON public.hr_shifts;
CREATE TRIGGER trg_hr_wf_shift_rename AFTER UPDATE OF name ON public.hr_shifts
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_shift_rename();

CREATE OR REPLACE FUNCTION public.hr_wf_position_rename()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.title IS NOT DISTINCT FROM OLD.title OR OLD.title IS NULL THEN RETURN NULL; END IF;
  UPDATE public.hr_employee_work_info SET job_role = NEW.title WHERE job_position_id = NEW.id AND job_role = OLD.title;
  UPDATE public.hr_employee_onboarding SET job_role = NEW.title WHERE position_id = NEW.id AND status = 'draft' AND job_role = OLD.title;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_position_rename() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_position_rename ON public.positions;
CREATE TRIGGER trg_hr_wf_position_rename AFTER UPDATE OF title ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_position_rename();

-- ===================== WF7 §5 · desk groups and multi-line saves =====================
CREATE OR REPLACE FUNCTION public.hr_wf_remove_desk_group(p_seat uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.hr_wf_is_current_manager() THEN RAISE EXCEPTION 'Only HRMS managers can remove a desk group'; END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for removing this desk group'; END IF;
  UPDATE public.hr_seat_capacity
     SET is_active = false, notes = concat_ws(E'\n', nullif(notes, ''), 'Removed: ' || btrim(p_reason))
   WHERE id = p_seat AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That desk group is no longer active'; END IF;
  -- Lines linked to the group without following it are unlinked, not left pointing at a removed group.
  PERFORM set_config('hr.wf_change_reason', 'Desk group removed: ' || btrim(p_reason), true);
  UPDATE public.hr_headcount_plans SET seat_capacity_id = NULL WHERE seat_capacity_id = p_seat AND NOT follow_desks;
  PERFORM set_config('hr.wf_change_reason', '', true);
END $function$;

CREATE OR REPLACE FUNCTION public.hr_wf_rehome_line(p_plan uuid, p_seat uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NOT private.hr_wf_is_current_manager() THEN RAISE EXCEPTION 'Only HRMS managers can move a line to another desk group'; END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Give a reason'; END IF;
  PERFORM set_config('hr.wf_change_reason', btrim(p_reason), true);
  UPDATE public.hr_headcount_plans SET seat_capacity_id = p_seat, follow_desks = true WHERE id = p_plan AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That staffing line is no longer active'; END IF;
  PERFORM set_config('hr.wf_change_reason', '', true);
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_rehome_line(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_rehome_line(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_wf_add_lines(p_lines jsonb)
RETURNS uuid[] LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE e jsonb; v_cols text; v_id uuid; v_ids uuid[] := '{}';
BEGIN
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Nothing to save'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'hr_headcount_plans' AND e ? c.column_name
       AND c.column_name NOT IN ('id','created_at','updated_at','auto_paused_at','auto_paused_by','auto_paused_by_name','auto_paused_reason','auto_paused_need','auto_paused_signature');
    IF v_cols IS NULL THEN RAISE EXCEPTION 'Nothing to save'; END IF;
    EXECUTE format('INSERT INTO public.hr_headcount_plans (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.hr_headcount_plans, $1) RETURNING id', v_cols)
      INTO v_id USING e;
    v_ids := v_ids || v_id;
  END LOOP;
  RETURN v_ids;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_add_lines(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_add_lines(jsonb) TO authenticated, service_role;

-- ===================== Data: every line moves to automatic priority =====================
DO $do$
BEGIN
  PERFORM set_config('hr.wf_reconciling', '1', true);
  UPDATE public.hr_headcount_plans SET priority = NULL WHERE priority IS NOT NULL;
  PERFORM set_config('hr.wf_reconciling', '', true);
END $do$;