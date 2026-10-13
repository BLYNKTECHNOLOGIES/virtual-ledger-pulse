-- WF2: hiring-flow fixes
ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS hiring_requirement_id uuid REFERENCES public.hr_hiring_requirements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hr_onboarding_hiring_requirement ON public.hr_employee_onboarding(hiring_requirement_id) WHERE hiring_requirement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hr_wf_onboarding_employee_type(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(btrim(coalesce(p,'')))
    WHEN 'contract' THEN 'contract' WHEN 'contractor' THEN 'contract'
    WHEN 'intern' THEN 'intern' WHEN 'internship' THEN 'intern'
    ELSE 'permanent' END
$$;
REVOKE ALL ON FUNCTION public.hr_wf_onboarding_employee_type(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_pick_requirement(p_department uuid, p_position uuid, p_shift uuid, p_preferred uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grp uuid := public.hr_wf_planning_shift(p_shift); v_id uuid;
BEGIN
  IF p_preferred IS NOT NULL THEN
    SELECT r.id INTO v_id FROM public.hr_hiring_requirements r
      LEFT JOIN public.hr_headcount_plans p ON p.id = r.staffing_plan_id
     WHERE r.id = p_preferred AND r.status IN ('approved','recruitment_active','partially_fulfilled')
       AND (p.id IS NULL OR (p.is_active AND (p_shift IS NULL
            OR cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
            OR v_grp = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)))));
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF p_department IS NULL OR p_position IS NULL THEN RETURN NULL; END IF;
  SELECT r.id INTO v_id
    FROM public.hr_hiring_requirements r
    JOIN public.hr_headcount_plans p ON p.id = r.staffing_plan_id AND p.is_active
    LEFT JOIN public.hr_wf_requirement_people(NULL) rp ON rp.requirement_id = r.id
   WHERE r.status IN ('approved','recruitment_active','partially_fulfilled')
     AND p.department_id IS NOT DISTINCT FROM p_department
     AND p_position = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))
     AND (cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
          OR v_grp = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)))
   ORDER BY (r.number_required - r.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0) > 0) DESC,
            cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) DESC,
            coalesce(r.requested_at, r.created_at), r.id
   LIMIT 1;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_pick_requirement(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_suggest_requirement(p_department uuid, p_position uuid, p_shift uuid, p_preferred uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR staff can view workforce planning' USING ERRCODE = '42501'; END IF;
  RETURN public.hr_wf_pick_requirement(p_department, p_position, p_shift, p_preferred);
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_suggest_requirement(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_suggest_requirement(uuid,uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_wf_onboarding_requirement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_roles uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.hiring_requirement_id IS NOT DISTINCT FROM OLD.hiring_requirement_id
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id AND NEW.position_id IS NOT DISTINCT FROM OLD.position_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.hiring_requirement_id IS DISTINCT FROM OLD.hiring_requirement_id THEN
    RAISE EXCEPTION 'This person has joined — the hiring requirement they filled can no longer be changed';
  END IF;
  IF NEW.hiring_requirement_id IS NULL THEN RETURN NEW; END IF;
  SELECT h.*, p.position_id AS l_pos, p.eligible_position_ids AS l_elig
    INTO r FROM public.hr_hiring_requirements h LEFT JOIN public.hr_headcount_plans p ON p.id = h.staffing_plan_id
   WHERE h.id = NEW.hiring_requirement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That hiring requirement no longer exists'; END IF;
  IF (TG_OP = 'INSERT' OR NEW.hiring_requirement_id IS DISTINCT FROM OLD.hiring_requirement_id)
     AND r.status NOT IN ('approved','recruitment_active','partially_fulfilled') THEN
    RAISE EXCEPTION '% is % — pick an approved or recruiting requirement', r.requirement_no, replace(r.status,'_',' ');
  END IF;
  v_roles := CASE WHEN r.staffing_plan_id IS NOT NULL THEN public.hr_wf_roles(r.l_pos, r.l_elig) ELSE ARRAY[r.position_id] END;
  IF NEW.department_id IS DISTINCT FROM r.department_id OR NEW.position_id IS NULL OR NOT (NEW.position_id = ANY(v_roles)) THEN
    RAISE EXCEPTION '% is for a different department or role — change "Fills hiring requirement" first', r.requirement_no;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_onboarding_requirement_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a0_hr_wf_onboarding_requirement ON public.hr_employee_onboarding;
CREATE TRIGGER a0_hr_wf_onboarding_requirement BEFORE INSERT OR UPDATE ON public.hr_employee_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_onboarding_requirement_guard();

CREATE OR REPLACE FUNCTION public.hr_wf_onboarding_people()
 RETURNS TABLE(onboarding_id uuid, requirement_id uuid, plan_id uuid, state text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH lines AS (
  SELECT p.id, p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) AS roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) AS groups
  FROM public.hr_headcount_plans p WHERE p.is_active
),
o AS (
  SELECT o.id, o.status, o.date_of_joining, o.employee_id,
    coalesce(e.is_active, false) AS emp_active,
    (o.status = 'completed' AND o.employee_id IS NOT NULL AND NOT coalesce(e.is_active, false)
      AND coalesce(e.resignation_status, '') = '' AND e.last_working_day IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_daily d WHERE d.employee_id = o.employee_id)) AS awaiting_activation,
    o.hiring_requirement_id AS rid, rq.staffing_plan_id AS rq_plan,
    coalesce(o.department_id, rq.department_id) AS dept, coalesce(o.position_id, rq.position_id) AS pos,
    public.hr_wf_planning_shift(coalesce(o.post_training_shift_id, o.shift_id, rq.shift_id)) AS grp
  FROM public.hr_employee_onboarding o
  LEFT JOIN public.hr_employees e ON e.id = o.employee_id
  LEFT JOIN public.hr_hiring_requirements rq ON rq.id = o.hiring_requirement_id
  WHERE o.status <> 'cancelled'
)
SELECT o.id, o.rid,
  coalesce((SELECT l.id FROM lines l WHERE l.id = o.rq_plan),
           (SELECT l.id FROM lines l WHERE l.department_id IS NOT DISTINCT FROM o.dept AND o.pos = ANY(l.roles)
              AND (cardinality(l.groups) = 0 OR o.grp = ANY(l.groups))
            ORDER BY cardinality(l.groups) DESC, l.id LIMIT 1)),
  CASE
    WHEN o.emp_active THEN CASE WHEN o.status = 'completed' THEN 'joined' ELSE 'on_roll' END
    WHEN o.status = 'completed' THEN CASE WHEN o.awaiting_activation THEN 'joining'
                                          WHEN o.employee_id IS NOT NULL THEN 'joined' ELSE 'gone' END
    WHEN o.date_of_joining IS NOT NULL THEN 'joining'
    ELSE 'selected' END
FROM o
$function$;

CREATE OR REPLACE FUNCTION public.hr_wf_progress_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old uuid; v_new uuid; v_ob uuid;
BEGIN
  IF TG_TABLE_NAME = 'ats_jobs' THEN
    v_new := NEW.requisition_id;
    IF TG_OP = 'UPDATE' THEN v_old := OLD.requisition_id; END IF;
  ELSIF TG_TABLE_NAME = 'ats_applications' THEN
    SELECT requisition_id INTO v_new FROM public.ats_jobs WHERE id = NEW.job_id;
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
      SELECT requisition_id INTO v_old FROM public.ats_jobs WHERE id = OLD.job_id;
    END IF;
    SELECT hiring_requirement_id INTO v_ob FROM public.hr_employee_onboarding
     WHERE ats_application_id = NEW.id AND status <> 'cancelled' LIMIT 1;
    IF v_ob IS DISTINCT FROM v_new THEN PERFORM public.hr_wf_refresh_requirement(v_ob); END IF;
  ELSIF TG_TABLE_NAME = 'hr_employee_onboarding' THEN
    v_new := NEW.hiring_requirement_id;
    IF TG_OP = 'UPDATE' AND OLD.hiring_requirement_id IS DISTINCT FROM NEW.hiring_requirement_id THEN
      v_old := OLD.hiring_requirement_id;
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
END $function$;

DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE ON public.hr_employee_onboarding FOR EACH ROW
  WHEN ((old.status IS DISTINCT FROM new.status) OR (old.ats_application_id IS DISTINCT FROM new.ats_application_id)
     OR (old.date_of_joining IS DISTINCT FROM new.date_of_joining) OR (old.employee_id IS DISTINCT FROM new.employee_id)
     OR (old.hiring_requirement_id IS DISTINCT FROM new.hiring_requirement_id))
  EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS zz_hr_wf_mark ON public.hr_employee_onboarding;
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR DELETE OR UPDATE ON public.hr_employee_onboarding FOR EACH ROW
  EXECUTE FUNCTION public.hr_wf_mark_change('status', 'date_of_joining', 'ats_application_id', 'department_id', 'position_id',
    'shift_id', 'post_training_shift_id', 'training_completion_date', 'employee_id', 'hiring_requirement_id');

CREATE OR REPLACE FUNCTION public.hr_wf_refresh_requirement(p_requirement uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_filled int; v_has_job boolean; v_new text; p record; v_left int; j record;
BEGIN
  IF p_requirement IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_requirement FOR UPDATE;
  IF NOT FOUND OR r.status IN ('draft','pending_approval','rejected','cancelled') THEN RETURN; END IF;
  SELECT * INTO p FROM public.hr_wf_requirement_people(p_requirement) LIMIT 1;
  v_filled := coalesce(p.joined_hc, 0);
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
  ELSE
    v_left := greatest(r.number_required - v_filled - coalesce(p.selected_hc,0) - coalesce(p.joining_hc,0), 0);
    FOR j IN SELECT id, openings, job_code FROM public.ats_jobs
              WHERE requisition_id = p_requirement AND status IN ('open','paused') AND openings IS DISTINCT FROM greatest(v_left, 1) LOOP
      UPDATE public.ats_jobs SET openings = greatest(v_left, 1) WHERE id = j.id;
      INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
      VALUES (j.id, 'job_openings',
        format('Openings %s → %s to match %s (%s still to find)', j.openings, greatest(v_left, 1), r.requirement_no, v_left),
        jsonb_build_object('requirement_id', r.id, 'from', j.openings, 'to', greatest(v_left, 1), 'still_to_find', v_left), 'System');
    END LOOP;
  END IF;
END $function$;

DROP FUNCTION IF EXISTS public.hr_workforce_staffing_matrix();
DROP FUNCTION IF EXISTS public.hr_wf_staffing_matrix_core();
CREATE FUNCTION public.hr_wf_staffing_matrix_core()
 RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer, shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date, over_requested_hc integer, operational_capacity integer, seat_active boolean, auto_paused_at timestamp with time zone, auto_paused_by_name text, auto_paused_reason text, auto_paused_need integer, replacement_cover_hc integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH b AS (SELECT * FROM public.hr_wf_line_base()),
tr AS (SELECT out_plan_id AS pid, count(*)::int AS n, min(out_ready_date) AS rd FROM public.hr_wf_trainee_allocation() GROUP BY 1),
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
  LEFT JOIN public.hr_wf_requirement_people(NULL) rp ON rp.requirement_id = hr.id
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
  GROUP BY 1
)
SELECT p.id, p.department_id, d.name, p.position_id,
  CASE WHEN cardinality(p.eligible_position_ids) > 1 THEN (
    SELECT string_agg(pos2.title, ' / ' ORDER BY array_position(p.eligible_position_ids, pos2.id))
    FROM public.positions pos2 WHERE pos2.id = ANY(p.eligible_position_ids)) ELSE pos.title END,
  p.shift_id, coalesce(s.name, p.shift_label), p.location, p.employment_type, p.approved_hc, p.required_hc,
  b.current_hc, coalesce(sc.physical_seats, 0), b.pipeline_hc, b.selected_hc, b.joining_hc, b.notice_hc,
  p.target_date, p.priority, b.open_count, b.open_hc,
  b.group_name, p.seat_capacity_id, p.follow_desks, coalesce(tr.n, 0), tr.rd,
  greatest(b.committed_hc - greatest(b.net_need - coalesce(tr.n, 0), 0) - least(b.notice_hc, coalesce(rep.n, 0)), 0),
  CASE WHEN sc.id IS NULL THEN NULL WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END,
  sc.is_active, p.auto_paused_at, p.auto_paused_by_name, p.auto_paused_reason, p.auto_paused_need,
  least(b.notice_hc, coalesce(rc.n, 0))
FROM public.hr_headcount_plans p
JOIN b ON b.plan_id = p.id
LEFT JOIN tr ON tr.pid = p.id
LEFT JOIN rep ON rep.pid = p.id
LEFT JOIN rc ON rc.pid = p.id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN public.hr_seat_capacity sc ON sc.id = p.seat_capacity_id
WHERE p.is_active
$function$;
REVOKE ALL ON FUNCTION public.hr_wf_staffing_matrix_core() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_wf_staffing_matrix_core() TO service_role;

DO $do$
BEGIN
  EXECUTE format($f$CREATE FUNCTION public.hr_workforce_staffing_matrix() RETURNS %s LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $b$
    #variable_conflict use_column
    BEGIN
      IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR staff can view workforce planning' USING ERRCODE = '42501'; END IF;
      RETURN QUERY SELECT * FROM public.hr_wf_staffing_matrix_core();
    END $b$$f$, pg_get_function_result('public.hr_wf_staffing_matrix_core()'::regprocedure));
END $do$;
REVOKE ALL ON FUNCTION public.hr_workforce_staffing_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_reconcile_capacity_hiring(p_sync_plans boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m record; pl record; rq record; pa_id uuid; pa_out int; pa_target date; other_open int; v_net int; desired int; v_target date; v_notes text;
  v_priority text; v_prev text; v_paused int; v_auto int;
  plans_synced int := 0; created int := 0; updated int := 0; cancelled int := 0; paused int := 0; n int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));
  v_prev := coalesce(current_setting('hr.wf_reconciling', true), '');
  PERFORM set_config('hr.wf_reconciling', '1', true);
  PERFORM set_config('hr.wf_reconcile_runs', (coalesce(nullif(current_setting('hr.wf_reconcile_runs', true), ''), '0')::int + 1)::text, true);

  FOR rq IN SELECT id FROM public.hr_hiring_requirements WHERE status IN ('approved','recruitment_active','partially_fulfilled') LOOP
    PERFORM public.hr_wf_refresh_requirement(rq.id);
  END LOOP;

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

  FOR m IN SELECT * FROM public.hr_wf_staffing_matrix_core() LOOP
    pa_id := NULL; pa_out := 0; pa_target := NULL; v_paused := 0;
    SELECT hr.id, greatest(hr.number_required - hr.positions_filled, 0), hr.target_joining_date
      INTO pa_id, pa_out, pa_target
      FROM public.hr_hiring_requirements hr
     WHERE hr.staffing_plan_id = m.plan_id AND hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
     LIMIT 1;
    v_net := greatest(m.required_hc - m.current_hc - m.selected_hc - m.pending_joining_hc - m.in_training_hc, 0);
    other_open := greatest(m.open_requirement_hc - coalesce(pa_out, 0) - coalesce(m.replacement_cover_hc, 0), 0);
    desired := greatest(v_net - other_open, 0);
    IF m.auto_paused_at IS NOT NULL THEN
      SELECT * INTO pl FROM public.hr_headcount_plans WHERE id = m.plan_id;
      IF pl.auto_paused_signature IS NOT DISTINCT FROM public.hr_wf_line_signature(m.plan_id) THEN
        v_paused := coalesce(pl.auto_paused_need, 0);
      ELSE
        UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
          auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL WHERE id = m.plan_id;
      END IF;
    END IF;
    v_auto := greatest(desired - v_paused, 0);
    IF v_paused > 0 AND desired > 0 AND v_auto < desired THEN paused := paused + 1; END IF;
    v_target := coalesce(m.target_date, pa_target, v_today + 30);
    v_priority := CASE WHEN m.required_hc > 0 AND v_net::numeric / m.required_hc >= 0.5 THEN 'critical'
                       WHEN m.required_hc > 0 AND v_net::numeric / m.required_hc >= 0.2 THEN 'high'
                       ELSE 'medium' END;
    v_notes := format('100%% occupancy on %s · %s: %s required, %s on roll, %s selected, %s joining, %s in training, %s already on other open requirements%s — %s still to hire%s.',
      coalesce(m.position_title, 'role'), m.shift_group_name, m.required_hc, m.current_hc, m.selected_hc,
      m.pending_joining_hc, m.in_training_hc, other_open,
      CASE WHEN coalesce(m.replacement_cover_hc,0) > 0 THEN format(' (%s more held for people still on notice)', m.replacement_cover_hc) ELSE '' END,
      v_auto,
      CASE WHEN v_paused > 0 THEN format('; %s declined by HR and paused', least(v_paused, desired)) ELSE '' END);
    IF pa_id IS NOT NULL THEN
      IF v_auto = 0 THEN
        UPDATE public.hr_hiring_requirements
           SET status = 'cancelled', reason_notes = v_notes,
               notes = concat_ws(E'\n', nullif(notes, ''), CASE WHEN desired > 0
                 THEN 'System-cancelled: the rest of this line''s shortage was declined by HR and is paused.'
                 ELSE 'System-cancelled: the live shortage is now covered.' END)
         WHERE id = pa_id;
        cancelled := cancelled + 1;
      ELSE
        UPDATE public.hr_hiring_requirements
           SET number_required = v_auto, reason_notes = v_notes
         WHERE id = pa_id AND (number_required IS DISTINCT FROM v_auto OR reason_notes IS DISTINCT FROM v_notes);
        IF FOUND THEN updated := updated + 1; END IF;
      END IF;
    ELSIF v_auto > 0 THEN
      INSERT INTO public.hr_hiring_requirements(requirement_no, staffing_plan_id, source, department_id, position_id, shift_id,
        shift_label, location, employment_type, number_required, target_joining_date, reason, reason_notes,
        requested_by_name, approver_name, priority, status, notes)
      VALUES (public.hr_next_hiring_requirement_no(), m.plan_id, 'capacity_occupancy', m.department_id, m.position_id, m.shift_id,
        m.shift_name, m.location, m.employment_type, v_auto, v_target, 'increased_workload', v_notes,
        'Workforce Planning System', NULL, v_priority, 'pending_approval',
        'System-generated for an uncovered staffing shortage on this line (100% desk occupancy policy).');
      created := created + 1;
    END IF;
  END LOOP;

  PERFORM set_config('hr.wf_reconciling', v_prev, true);
  RETURN jsonb_build_object('plans_synced', plans_synced, 'plans_created', 0, 'plans_updated', plans_synced,
    'requirements_created', created, 'requirements_updated', updated, 'requirements_cancelled', cancelled, 'lines_paused', paused);
END $function$;

DO $do$
DECLARE v text := pg_get_functiondef('public.hr_requirement_transition(uuid,text,text)'::regprocedure);
  a text := $a$  IF v_new IN ('rejected','cancelled') AND v_uid IS NOT NULL AND r.source = 'capacity_occupancy' AND r.staffing_plan_id IS NOT NULL THEN
    UPDATE public.hr_headcount_plans
       SET auto_paused_at = now(), auto_paused_by = v_uid, auto_paused_by_name = v_name, auto_paused_reason = v_reason,
           auto_paused_need = greatest(r.number_required - r.positions_filled, 0),
           auto_paused_signature = public.hr_wf_line_signature(r.staffing_plan_id)
     WHERE id = r.staffing_plan_id;$a$;
  b text := $b$  IF v_new IN ('rejected','cancelled') AND v_uid IS NOT NULL AND r.source = 'capacity_occupancy' AND r.status = 'pending_approval' AND r.staffing_plan_id IS NOT NULL THEN
    UPDATE public.hr_headcount_plans
       SET auto_paused_at = now(), auto_paused_by = v_uid, auto_paused_by_name = v_name, auto_paused_reason = v_reason,
           auto_paused_need = CASE WHEN auto_paused_at IS NOT NULL AND auto_paused_signature IS NOT DISTINCT FROM public.hr_wf_line_signature(r.staffing_plan_id)
                                   THEN coalesce(auto_paused_need, 0) ELSE 0 END + greatest(r.number_required - r.positions_filled, 0),
           auto_paused_signature = public.hr_wf_line_signature(r.staffing_plan_id)
     WHERE id = r.staffing_plan_id;$b$;
BEGIN
  IF position(a in v) = 0 THEN RAISE EXCEPTION 'transition pattern not found'; END IF;
  EXECUTE replace(v, a, b);
END $do$;

DO $do$
DECLARE v text := pg_get_functiondef('public.hr_update_requirement(uuid,jsonb,text)'::regprocedure);
  a text := $a$  PERFORM set_config('hr.wf_change_reason', '', true);
  PERFORM public.hr_wf_refresh_requirement(p_id);$a$;
  b text := $b$  IF r.source = 'capacity_occupancy' AND r.status = 'pending_approval' AND r.staffing_plan_id IS NOT NULL AND NOT v_moving
     AND p_patch ? 'number_required' AND (p_patch->>'number_required')::int < r.number_required THEN
    UPDATE public.hr_headcount_plans
       SET auto_paused_at = now(), auto_paused_by = v_uid, auto_paused_by_name = public.hr_wf_user_name(v_uid),
           auto_paused_reason = coalesce(v_reason, format('Lowered %s from %s to %s', r.requirement_no, r.number_required, (p_patch->>'number_required')::int)),
           auto_paused_need = CASE WHEN auto_paused_at IS NOT NULL AND auto_paused_signature IS NOT DISTINCT FROM public.hr_wf_line_signature(r.staffing_plan_id)
                                   THEN coalesce(auto_paused_need, 0) ELSE 0 END + (r.number_required - (p_patch->>'number_required')::int),
           auto_paused_signature = public.hr_wf_line_signature(r.staffing_plan_id)
     WHERE id = r.staffing_plan_id;
  END IF;
  PERFORM set_config('hr.wf_change_reason', '', true);
  PERFORM public.hr_wf_refresh_requirement(p_id);$b$;
BEGIN
  IF position(a in v) = 0 THEN RAISE EXCEPTION 'update pattern not found'; END IF;
  EXECUTE replace(v, a, b);
END $do$;

DO $do$
DECLARE v text := pg_get_functiondef('public.hr_raise_replacement_requirement(uuid,text)'::regprocedure);
BEGIN
  v := replace(v, $a$WHERE replacement_employee_id = p_employee AND source = 'employee_separation'
     AND status$a$, $b$WHERE replacement_employee_id = p_employee
     AND status$b$);
  v := replace(v, $a$  v_date := coalesce(e.last_working_day, e.notice_period_end_date);$a$,
    $b$  v_line := coalesce((SELECT t.out_plan_id FROM public.hr_wf_trainee_allocation() t WHERE t.out_employee_id = p_employee LIMIT 1), v_line);
  v_date := coalesce(e.last_working_day, e.notice_period_end_date);$b$);
  IF position('out_plan_id' in v) = 0 OR position($x$AND source = 'employee_separation'$x$ in v) > 0 THEN RAISE EXCEPTION 'replacement pattern not found'; END IF;
  EXECUTE v;
END $do$;

DO $do$
DECLARE v text := pg_get_functiondef('public.hr_wf_position_lines_follow()'::regprocedure);
  a text := $a$WHERE staffing_plan_id = l.id AND source = 'capacity_occupancy' AND status = 'pending_approval';$a$;
BEGIN
  IF position(a in v) = 0 THEN RAISE EXCEPTION 'position pattern not found'; END IF;
  EXECUTE replace(v, a, $b$WHERE staffing_plan_id = l.id AND status = 'pending_approval';$b$);
END $do$;

DROP FUNCTION IF EXISTS public.ats_move_stage(uuid, uuid, text);
CREATE FUNCTION public.ats_move_stage(p_application_id uuid, p_stage_id uuid, p_note text DEFAULT NULL::text, p_hired_shift uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_status text;
BEGIN
SELECT status INTO v_status FROM public.ats_applications WHERE id = p_application_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
IF v_status IN ('rejected', 'withdrawn') THEN
RAISE EXCEPTION 'ATS_APPLICATION_CLOSED' USING HINT = 'Reopen the application before moving it.';
END IF;
IF NOT EXISTS (SELECT 1 FROM public.ats_stages WHERE id = p_stage_id AND is_active) THEN
RAISE EXCEPTION 'ATS_STAGE_NOT_FOUND';
END IF;
PERFORM set_config('ats.transition_note', coalesce(p_note, ''), true);
PERFORM set_config('ats.hired_shift', coalesce(p_hired_shift::text, ''), true);
UPDATE public.ats_applications
SET stage_id = p_stage_id,
reviewed_at = coalesce(reviewed_at, now())
WHERE id = p_application_id;
PERFORM set_config('ats.hired_shift', '', true);
END $function$;
REVOKE ALL ON FUNCTION public.ats_move_stage(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_move_stage(uuid,uuid,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_ats_hire_handoff()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_actor text := public.ats_actor_name(auth.uid());
  c public.ats_candidates%ROWTYPE; j public.ats_jobs%ROWTYPE; rq public.hr_hiring_requirements%ROWTYPE; o public.hr_employee_onboarding%ROWTYPE;
  x public.hr_employee_onboarding%ROWTYPE;
  v_first text; v_last text; v_shift uuid; v_type text; v_id uuid; v_sids uuid[]; v_req uuid; v_pref text; v_other text;
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
      v_req := public.hr_wf_pick_requirement(coalesce(j.department_id, rq.department_id), coalesce(j.position_id, rq.position_id), v_shift, j.requisition_id);
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
              jsonb_build_object('error', SQLERRM), v_uid, v_actor);
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

DROP TRIGGER IF EXISTS trg_hr_ats_hire_handoff_ins ON public.ats_applications;
CREATE TRIGGER trg_hr_ats_hire_handoff_ins AFTER INSERT ON public.ats_applications FOR EACH ROW
  WHEN (new.status = 'hired') EXECUTE FUNCTION public.hr_ats_hire_handoff();