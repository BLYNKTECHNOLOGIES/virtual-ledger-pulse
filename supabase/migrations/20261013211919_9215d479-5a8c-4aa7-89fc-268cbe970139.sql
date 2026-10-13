-- WF4: department "adds headcount" requests, budget averages from >=2 people, shift labels, daily reconcile cron in a migration

ALTER TABLE public.hr_hiring_requirements
  ADD COLUMN IF NOT EXISTS adds_headcount integer NOT NULL DEFAULT 0 CHECK (adds_headcount >= 0);
COMMENT ON COLUMN public.hr_hiring_requirements.adds_headcount IS
  'Department-head request that adds N beyond the line''s required number; approval raises the line by N.';

-- Browser writes may not set or change adds_headcount (only hr_department_request_hiring sets it)
CREATE OR REPLACE FUNCTION public.hr_wf_guard_requirement_columns()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.status,'') NOT IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'A new hiring requirement can only start as a draft or awaiting approval';
    END IF;
    IF coalesce(NEW.source,'manual') <> 'manual' THEN
      RAISE EXCEPTION 'Only manual hiring requirements can be created here';
    END IF;
    IF coalesce(NEW.positions_filled,0) <> 0 OR NEW.approver_id IS NOT NULL OR NEW.approver_name IS NOT NULL
       OR NEW.approved_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL OR coalesce(NEW.adds_headcount,0) <> 0 THEN
      RAISE EXCEPTION 'A new hiring requirement cannot be pre-approved or pre-filled';
    END IF;
    NEW.source := 'manual';
    NEW.requirement_no := NULL;
    NEW.requested_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.positions_filled IS DISTINCT FROM OLD.positions_filled
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.requirement_no IS DISTINCT FROM OLD.requirement_no
     OR NEW.adds_headcount IS DISTINCT FROM OLD.adds_headcount THEN
    RAISE EXCEPTION 'Status, approval, filled count, source and number change only through the requirement actions';
  END IF;
  RETURN NEW;
END $function$;

-- New requirements get a shift label built from the shift / the line's shift group when none is given
CREATE OR REPLACE FUNCTION public.hr_wf_fill_requirement_label()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  IF coalesce(btrim(NEW.shift_label), '') = '' THEN
    IF NEW.staffing_plan_id IS NOT NULL THEN
      SELECT public.hr_wf_shift_label(p.shift_id, p.eligible_shift_ids) INTO v FROM public.hr_headcount_plans p WHERE p.id = NEW.staffing_plan_id;
    END IF;
    IF v IS NULL AND NEW.shift_id IS NOT NULL THEN v := public.hr_wf_shift_label(NEW.shift_id, NULL); END IF;
    IF v IS NOT NULL THEN NEW.shift_label := v; END IF;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS a2_hr_wf_fill_requirement_label ON public.hr_hiring_requirements;
CREATE TRIGGER a2_hr_wf_fill_requirement_label BEFORE INSERT ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_fill_requirement_label();
REVOKE EXECUTE ON FUNCTION public.hr_wf_fill_requirement_label() FROM PUBLIC, anon, authenticated;

-- Department head request: fill the current gap, or add headcount beyond the line's required number
DROP FUNCTION IF EXISTS public.hr_department_request_hiring(uuid, integer, date, text);
CREATE OR REPLACE FUNCTION public.hr_department_request_hiring(p_plan_id uuid, p_number integer, p_target date, p_reason text, p_adds boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me record; v_plan record; v_open text; v_no text; v_id uuid; v_gap int;
BEGIN
  SELECT e.id, trim(concat_ws(' ', e.first_name, nullif(e.last_name, ''))) AS name INTO v_me
  FROM public.hr_employees e WHERE e.user_id = auth.uid() AND auth.uid() IS NOT NULL AND e.is_active LIMIT 1;
  SELECT p.*, d.head_employee_id INTO v_plan FROM public.hr_headcount_plans p
  LEFT JOIN public.departments d ON d.id = p.department_id WHERE p.id = p_plan_id AND p.is_active;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'This staffing line no longer exists'; END IF;
  IF v_me.id IS NULL OR v_plan.head_employee_id IS DISTINCT FROM v_me.id THEN
    RAISE EXCEPTION 'Only the head of this department can request people for this line';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Please give a reason for the request'; END IF;
  IF coalesce(p_adds, false) THEN
    IF p_number IS NULL OR p_number < 1 OR p_number > 50 THEN
      RAISE EXCEPTION 'Ask for between 1 and 50 additional people';
    END IF;
  ELSE
    SELECT greatest(lb.required_hc - lb.current_hc, 0) INTO v_gap FROM public.hr_wf_line_base() lb WHERE lb.plan_id = p_plan_id;
    IF coalesce(v_gap, 0) < 1 THEN
      RAISE EXCEPTION 'This line has no current gap — ask for additional headcount instead';
    END IF;
    IF p_number IS NULL OR p_number < 1 OR p_number > v_gap THEN
      RAISE EXCEPTION 'Ask for between 1 and % people to fill the current gap, or ask for additional headcount', v_gap;
    END IF;
  END IF;
  SELECT r.requirement_no INTO v_open FROM public.hr_hiring_requirements r
  WHERE r.staffing_plan_id = p_plan_id AND r.source = 'department_request'
    AND r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') LIMIT 1;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'There is already an open department request for this line (%)', v_open;
  END IF;
  v_no := public.hr_next_hiring_requirement_no();
  INSERT INTO public.hr_hiring_requirements (requirement_no, department_id, position_id, shift_id, shift_label, location,
    employment_type, number_required, target_joining_date, priority, reason, reason_notes, source, status,
    staffing_plan_id, requested_by, requested_by_name, adds_headcount)
  VALUES (v_no, v_plan.department_id, v_plan.position_id, v_plan.shift_id,
    public.hr_wf_shift_label(v_plan.shift_id, v_plan.eligible_shift_ids), v_plan.location,
    v_plan.employment_type, p_number, p_target, coalesce(v_plan.priority, 'medium'),
    CASE WHEN coalesce(p_adds,false) THEN 'new_position' ELSE 'increased_workload' END, trim(p_reason),
    'department_request', 'pending_approval', p_plan_id, auth.uid(), v_me.name,
    CASE WHEN coalesce(p_adds,false) THEN p_number ELSE 0 END)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'requirement_no', v_no);
END $function$;
REVOKE EXECUTE ON FUNCTION public.hr_department_request_hiring(uuid, integer, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_department_request_hiring(uuid, integer, date, text, boolean) TO authenticated;

-- Approval of an "adds headcount" request raises the line in the same action (refused on desk-following lines)
CREATE OR REPLACE FUNCTION public.hr_requirement_transition(p_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_uid uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')), ''); v_name text; v_new text;
  v_line text; v_other text; v_plan record;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(v_uid)) THEN
    RAISE EXCEPTION 'Only HRMS managers can change a hiring requirement''s status';
  END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;
  PERFORM set_config('hr.wf_change_reason', coalesce(v_reason, ''), true);
  v_name := public.hr_wf_user_name(v_uid);

  CASE lower(coalesce(p_action,''))
    WHEN 'submit' THEN
      IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted (this one is %)', replace(r.status,'_',' '); END IF;
      IF r.source = 'capacity_occupancy' AND r.staffing_plan_id IS NOT NULL THEN
        SELECT requirement_no INTO v_other FROM public.hr_hiring_requirements
         WHERE staffing_plan_id = r.staffing_plan_id AND source = 'capacity_occupancy' AND status = 'pending_approval' AND id <> r.id LIMIT 1;
        IF v_other IS NOT NULL THEN
          RAISE EXCEPTION 'This line already has an automatic request awaiting approval (%). Approve, edit or cancel % instead of submitting this one.', v_other, v_other;
        END IF;
        UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
          auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL
         WHERE id = r.staffing_plan_id AND auto_paused_at IS NOT NULL;
      END IF;
      v_new := 'pending_approval';
      v_line := CASE WHEN v_reason IS NOT NULL THEN public.hr_wf_note_line('Submitted', v_uid, v_reason) END;
      UPDATE public.hr_hiring_requirements SET status = v_new, notes = concat_ws(E'\n', nullif(notes,''), v_line) WHERE id = p_id;
    WHEN 'approve' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be approved (this one is %)', replace(r.status,'_',' '); END IF;
      IF coalesce(r.adds_headcount, 0) > 0 THEN
        IF r.staffing_plan_id IS NULL THEN RAISE EXCEPTION 'This request adds headcount but is not on a staffing line — move it to a line first'; END IF;
        SELECT p.*, sc.physical_seats, coalesce(sc.max_operational_capacity, sc.physical_seats) AS desks
          INTO v_plan FROM public.hr_headcount_plans p LEFT JOIN public.hr_seat_capacity sc ON sc.id = p.seat_capacity_id
         WHERE p.id = r.staffing_plan_id FOR UPDATE OF p;
        IF v_plan.follow_desks THEN
          RAISE EXCEPTION '% adds % beyond this line''s required number, but the line follows its desk group (% desks) and cannot exceed its desks. Switch the line to fixed numbers first, or add desks to the desk group.',
            r.requirement_no, r.adds_headcount, coalesce(v_plan.desks, 0);
        END IF;
      END IF;
      v_new := 'approved';
      v_line := CASE WHEN v_reason IS NOT NULL THEN public.hr_wf_note_line('Approved', v_uid, v_reason) END;
      UPDATE public.hr_hiring_requirements SET status = v_new, approver_id = v_uid,
        approver_name = CASE WHEN v_uid IS NULL THEN 'System' ELSE v_name END, approved_at = now(),
        rejection_reason = NULL, notes = concat_ws(E'\n', nullif(notes,''), v_line) WHERE id = p_id;
      IF coalesce(r.adds_headcount, 0) > 0 THEN
        PERFORM set_config('hr.wf_change_reason',
          format('Approved %s: department request adds %s headcount%s', r.requirement_no, r.adds_headcount,
                 CASE WHEN v_reason IS NOT NULL THEN ' — ' || v_reason ELSE '' END), true);
        UPDATE public.hr_headcount_plans
           SET required_hc = required_hc + r.adds_headcount,
               approved_hc = greatest(approved_hc, required_hc + r.adds_headcount)
         WHERE id = r.staffing_plan_id;
      END IF;
    WHEN 'reject' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be rejected (this one is %)', replace(r.status,'_',' '); END IF;
      IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for rejecting this requirement'; END IF;
      v_new := 'rejected';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = v_reason,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Rejected', v_uid, v_reason)) WHERE id = p_id;
    WHEN 'cancel' THEN
      IF r.status NOT IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN
        RAISE EXCEPTION 'Only an open requirement can be cancelled (this one is %)', replace(r.status,'_',' ');
      END IF;
      IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for cancelling this requirement'; END IF;
      v_new := 'cancelled';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Cancelled', v_uid, v_reason)) WHERE id = p_id;
    WHEN 'reopen' THEN
      IF r.status NOT IN ('rejected','cancelled') THEN RAISE EXCEPTION 'Only a rejected or cancelled requirement can be reopened (this one is %)', replace(r.status,'_',' '); END IF;
      v_new := 'draft';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL, approver_id = NULL,
        approver_name = NULL, approved_at = NULL,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Reopened', v_uid, coalesce(v_reason, 'back to draft'))) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'Unknown action "%" — use submit, approve, reject, cancel or reopen', coalesce(p_action,'');
  END CASE;

  IF v_new IN ('rejected','cancelled') AND v_uid IS NOT NULL AND r.source = 'capacity_occupancy' AND r.status = 'pending_approval' AND r.staffing_plan_id IS NOT NULL THEN
    UPDATE public.hr_headcount_plans
       SET auto_paused_at = now(), auto_paused_by = v_uid, auto_paused_by_name = v_name, auto_paused_reason = v_reason,
           auto_paused_need = CASE WHEN auto_paused_at IS NOT NULL AND auto_paused_signature IS NOT DISTINCT FROM public.hr_wf_line_signature(r.staffing_plan_id)
                                   THEN coalesce(auto_paused_need, 0) ELSE 0 END + greatest(r.number_required - r.positions_filled, 0),
           auto_paused_signature = public.hr_wf_line_signature(r.staffing_plan_id)
     WHERE id = r.staffing_plan_id;
  END IF;

  PERFORM set_config('hr.wf_change_reason', '', true);
  SELECT status INTO v_new FROM public.hr_hiring_requirements WHERE id = p_id;
  RETURN v_new;
END $function$;

-- Salary budget: averages only from >= 2 people; trainees and hired-joining people counted; uncovered net of trainees
CREATE OR REPLACE FUNCTION public.hr_workforce_budget()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.hr_wf_is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only HRMS managers can view the salary budget';
  END IF;
  WITH lb AS MATERIALIZED (SELECT * FROM public.hr_wf_line_base()),
  tr AS MATERIALIZED (
    SELECT out_employee_id eid, out_plan_id pid
    FROM public.hr_wf_trainee_allocation_from((SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM lb b))
  ),
  ppl AS MATERIALIZED (
    SELECT p.*, nullif(e.total_salary, 0) / 12.0 AS ctc
    FROM public.hr_wf_people() p JOIN public.hr_employees e ON e.id = p.employee_id
  ),
  role_avg AS (SELECT position_id, avg(ctc) a, count(*)::int n FROM ppl WHERE ctc IS NOT NULL GROUP BY 1 HAVING count(*) >= 2),
  dept_avg AS (SELECT department_id, avg(ctc) a, count(*)::int n FROM ppl WHERE ctc IS NOT NULL GROUP BY 1 HAVING count(*) >= 2),
  all_avg AS (SELECT avg(ctc) a, count(*)::int n FROM ppl WHERE ctc IS NOT NULL HAVING count(*) >= 2),
  rp AS (SELECT * FROM public.hr_wf_requirement_people(NULL)),
  rq AS (
    SELECT r.id, r.requirement_no, r.staffing_plan_id pid, r.position_id, r.department_id,
      greatest(r.number_required - r.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0) AS ppl_open,
      CASE WHEN r.salary_min IS NOT NULL OR r.salary_max IS NOT NULL
             THEN (coalesce(r.salary_min, r.salary_max) + coalesce(r.salary_max, r.salary_min)) / 2.0 END AS req_mid,
      (SELECT (coalesce(j.salary_min, j.salary_max) + coalesce(j.salary_max, j.salary_min)) / 2.0
              / CASE WHEN j.salary_period IN ('yearly','annual','annually','per_annum') THEN 12 ELSE 1 END
         FROM public.ats_jobs j WHERE j.requisition_id = r.id AND (j.salary_min IS NOT NULL OR j.salary_max IS NOT NULL)
         ORDER BY (j.status IN ('open','paused')) DESC, j.created_at DESC LIMIT 1) AS job_mid
    FROM public.hr_hiring_requirements r LEFT JOIN rp ON rp.requirement_id = r.id
    WHERE r.staffing_plan_id IS NOT NULL
      AND r.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
  ),
  rqc AS (
    SELECT rq.*,
      coalesce(rq.req_mid, rq.job_mid, ra.a, da.a, aa.a) AS per_person,
      CASE WHEN rq.req_mid IS NOT NULL THEN 'requirement salary range'
           WHEN rq.job_mid IS NOT NULL THEN 'ATS job salary range'
           WHEN ra.a IS NOT NULL THEN format('role average CTC (%s people)', ra.n)
           WHEN da.a IS NOT NULL THEN format('department average CTC (%s people)', da.n)
           WHEN aa.a IS NOT NULL THEN format('average CTC of all planned staff (%s people)', aa.n)
           ELSE 'no salary data' END AS basis,
      (rq.req_mid IS NULL AND rq.job_mid IS NULL) AS no_range
    FROM rq LEFT JOIN role_avg ra ON ra.position_id = rq.position_id
    LEFT JOIN dept_avg da ON da.department_id = rq.department_id
    LEFT JOIN all_avg aa ON true
  ),
  line AS (
    SELECT lb.plan_id, lb.department_id, d.name AS department_name, hp.position_id, pos.title AS position_title,
      lb.group_name AS shift_label, lb.required_hc, lb.current_hc, lb.net_need, lb.open_hc,
      (lb.selected_hc + lb.joining_hc) AS joining_hc,
      (SELECT count(*)::int FROM tr WHERE tr.pid = lb.plan_id) AS training_hc,
      coalesce((SELECT sum(x.ctc) FROM ppl x WHERE NOT x.is_training AND x.department_id IS NOT DISTINCT FROM lb.department_id
         AND x.position_id = ANY(lb.roles) AND (cardinality(lb.groups) = 0 OR x.group_id = ANY(lb.groups))), 0)
      + coalesce((SELECT sum(x.ctc) FROM tr JOIN ppl x ON x.employee_id = tr.eid WHERE tr.pid = lb.plan_id), 0) AS on_roll_cost,
      (SELECT sum(c.ppl_open * c.per_person) FROM rqc c WHERE c.pid = lb.plan_id) AS hiring_cost,
      (SELECT sum(c.ppl_open) FROM rqc c WHERE c.pid = lb.plan_id) AS hiring_ppl,
      (SELECT c.per_person FROM rqc c WHERE c.pid = lb.plan_id AND NOT c.no_range ORDER BY c.ppl_open DESC LIMIT 1) AS req_pp,
      (SELECT c.basis FROM rqc c WHERE c.pid = lb.plan_id AND NOT c.no_range ORDER BY c.ppl_open DESC LIMIT 1) AS req_basis,
      (SELECT string_agg(DISTINCT c.basis, ', ') FROM rqc c WHERE c.pid = lb.plan_id) AS hiring_basis,
      coalesce(ra.a, da.a, aa.a) AS avg_pp,
      CASE WHEN ra.a IS NOT NULL THEN format('role average CTC (%s people)', ra.n)
           WHEN da.a IS NOT NULL THEN format('department average CTC (%s people)', da.n)
           WHEN aa.a IS NOT NULL THEN format('average CTC of all planned staff (%s people)', aa.n) END AS avg_basis
    FROM lb JOIN public.hr_headcount_plans hp ON hp.id = lb.plan_id
    LEFT JOIN public.departments d ON d.id = lb.department_id
    LEFT JOIN public.positions pos ON pos.id = hp.position_id
    LEFT JOIN role_avg ra ON ra.position_id = hp.position_id
    LEFT JOIN dept_avg da ON da.department_id = lb.department_id
    LEFT JOIN all_avg aa ON true
  ),
  l2 AS (
    SELECT l.*, (l.current_hc + l.training_hc) AS head_hc,
      coalesce(l.req_pp, l.avg_pp) AS pp,
      coalesce(CASE WHEN l.req_pp IS NOT NULL THEN l.req_basis END, l.avg_basis, 'no salary data') AS pp_basis,
      greatest(l.net_need - l.open_hc - l.training_hc, 0) AS uncovered,
      greatest(l.required_hc - l.current_hc - l.training_hc, 0) AS short
    FROM line l
  ),
  l3 AS (
    SELECT l2.*, l2.on_roll_cost + l2.short * coalesce(l2.pp,0) AS full_cost,
      l2.uncovered * coalesce(l2.pp,0) AS uncovered_cost,
      l2.joining_hc * coalesce(l2.pp,0) AS joining_cost
    FROM l2
  ),
  dsize AS (SELECT department_id, sum(head_hc) h FROM l3 GROUP BY 1),
  -- departments with fewer than 2 people on roll are grouped so no total is one person's salary
  l4 AS (
    SELECT l3.*, CASE WHEN ds.h >= 2 THEN l3.department_id END AS dgrp,
      CASE WHEN ds.h >= 2 THEN l3.department_name ELSE 'Smaller departments (grouped)' END AS dgrp_name
    FROM l3 JOIN dsize ds ON ds.department_id IS NOT DISTINCT FROM l3.department_id
  )
  SELECT jsonb_build_object(
    'company', (SELECT jsonb_build_object('on_roll_hc', sum(head_hc), 'training_hc', sum(training_hc),
        'on_roll_cost', round(sum(on_roll_cost)),
        'hiring_hc', sum(coalesce(hiring_ppl,0)), 'hiring_cost', round(sum(coalesce(hiring_cost,0))),
        'joining_hc', sum(joining_hc), 'joining_cost', round(sum(joining_cost)),
        'uncovered_hc', sum(uncovered), 'uncovered_cost', round(sum(uncovered_cost)),
        'required_hc', sum(required_hc), 'full_cost', round(sum(full_cost))) FROM l4),
    'departments', coalesce((SELECT jsonb_agg(x ORDER BY (x->>'department_id') IS NULL, x->>'department_name') FROM (
        SELECT jsonb_build_object('department_id', dgrp, 'department_name', dgrp_name,
          'on_roll_hc', sum(head_hc), 'training_hc', sum(training_hc),
          'on_roll_cost', CASE WHEN sum(head_hc) >= 2 THEN round(sum(on_roll_cost)) END,
          'hiring_hc', sum(coalesce(hiring_ppl,0)), 'hiring_cost', round(sum(coalesce(hiring_cost,0))),
          'joining_hc', sum(joining_hc), 'joining_cost', round(sum(joining_cost)),
          'uncovered_hc', sum(uncovered), 'uncovered_cost', round(sum(uncovered_cost)),
          'required_hc', sum(required_hc),
          'full_cost', CASE WHEN sum(head_hc) >= 2 OR sum(head_hc) = 0 THEN round(sum(full_cost)) END) x
        FROM l4 GROUP BY dgrp, dgrp_name) s), '[]'::jsonb),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object('plan_id', plan_id, 'department_id', department_id,
        'position_title', position_title, 'shift_label', shift_label, 'required_hc', required_hc,
        'on_roll_hc', head_hc, 'training_hc', training_hc,
        'on_roll_cost', CASE WHEN head_hc >= 2 THEN round(on_roll_cost) END,
        'on_roll_avg', CASE WHEN head_hc >= 2 THEN round(on_roll_cost / head_hc) END,
        'hiring_hc', coalesce(hiring_ppl,0), 'hiring_cost', round(coalesce(hiring_cost,0)), 'hiring_basis', hiring_basis,
        'joining_hc', joining_hc, 'joining_cost', round(joining_cost),
        'uncovered_hc', uncovered, 'uncovered_cost', round(uncovered_cost),
        'per_person', round(pp), 'per_person_basis', pp_basis,
        'full_cost', CASE WHEN head_hc >= 2 OR head_hc = 0 THEN round(full_cost) END,
        'grouped', head_hc = 1)) FROM l4), '[]'::jsonb),
    'requirements', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'people', ppl_open,
        'per_person', round(per_person), 'basis', basis, 'no_range', no_range)) FROM rqc), '[]'::jsonb),
    'unpriced', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'requirement_no', c.requirement_no, 'people', c.ppl_open,
        'position_title', pos.title, 'per_person', round(c.per_person), 'basis', c.basis) ORDER BY c.requirement_no)
        FROM rqc c LEFT JOIN public.positions pos ON pos.id = c.position_id WHERE c.no_range AND c.ppl_open > 0), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $function$;
REVOKE EXECUTE ON FUNCTION public.hr_workforce_budget() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_budget() TO authenticated;

-- Forecast hire rows: shift label built from the shift when the stored label is empty
CREATE OR REPLACE FUNCTION public.hr_workforce_forecast_events()
 RETURNS TABLE(kind text, plan_id uuid, department_id uuid, position_id uuid, event_date date, qty integer, ref_id uuid, person_name text, badge_id text, role_title text, shift_name text, requirement_no text, requirement_status text, related_requirement_no text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.hr_wf_is_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only HR staff can view the workforce forecast';
  END IF;
  RETURN QUERY
  SELECT 'exit'::text, ls.plan_id, ls.department_id, ls.position_id, ls.last_working_day, 1,
    ls.employee_id, trim(concat_ws(' ', e.first_name, nullif(e.last_name,''))), e.badge_id::text, pos.title::text,
    sh.name::text, NULL::text, NULL::text,
    (SELECT r.requirement_no FROM public.hr_hiring_requirements r WHERE r.replacement_employee_id = ls.employee_id
       AND r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') ORDER BY r.created_at DESC LIMIT 1)::text
  FROM public.hr_workforce_leaving_soon() ls
  JOIN public.hr_employees e ON e.id = ls.employee_id
  LEFT JOIN public.positions pos ON pos.id = ls.position_id
  LEFT JOIN public.hr_wf_people() p ON p.employee_id = ls.employee_id
  LEFT JOIN public.hr_shifts sh ON sh.id = p.shift_id
  UNION ALL
  SELECT 'joiner', op.plan_id, o.department_id, o.position_id, o.date_of_joining, 1,
    o.id, trim(concat_ws(' ', o.first_name, nullif(o.last_name,''))), NULL, pos.title::text,
    sh.name::text, rq.requirement_no::text, NULL, NULL
  FROM public.hr_wf_onboarding_people() op
  JOIN public.hr_employee_onboarding o ON o.id = op.onboarding_id
  LEFT JOIN public.positions pos ON pos.id = o.position_id
  LEFT JOIN public.hr_shifts sh ON sh.id = coalesce(o.post_training_shift_id, o.shift_id)
  LEFT JOIN public.hr_hiring_requirements rq ON rq.id = op.requirement_id
  WHERE op.state = 'joining'
  UNION ALL
  SELECT 'trainee', ta.out_plan_id, p.department_id, p.position_id, ta.out_ready_date, 1,
    ta.out_employee_id, trim(concat_ws(' ', e.first_name, nullif(e.last_name,''))), e.badge_id::text, pos.title::text,
    NULL, NULL, NULL, NULL
  FROM public.hr_wf_trainee_allocation() ta
  JOIN public.hr_wf_people() p ON p.employee_id = ta.out_employee_id
  JOIN public.hr_employees e ON e.id = ta.out_employee_id
  LEFT JOIN public.positions pos ON pos.id = p.position_id
  UNION ALL
  SELECT 'hire', r.staffing_plan_id, r.department_id, r.position_id, r.target_joining_date,
    greatest(r.number_required - r.positions_filled - coalesce(rp.joining_hc, 0), 0)::int,
    r.id, NULL, NULL, pos.title::text,
    coalesce(nullif(btrim(r.shift_label), ''),
      CASE WHEN hp.id IS NOT NULL THEN public.hr_wf_shift_label(hp.shift_id, hp.eligible_shift_ids)
           WHEN r.shift_id IS NOT NULL THEN public.hr_wf_shift_label(r.shift_id, NULL) END)::text,
    r.requirement_no::text, r.status::text, NULL
  FROM public.hr_hiring_requirements r
  LEFT JOIN public.hr_headcount_plans hp ON hp.id = r.staffing_plan_id
  LEFT JOIN public.hr_wf_requirement_people(NULL) rp ON rp.requirement_id = r.id
  LEFT JOIN public.positions pos ON pos.id = r.position_id
  WHERE r.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
    AND greatest(r.number_required - r.positions_filled - coalesce(rp.joining_hc, 0), 0) > 0;
END $function$;
REVOKE EXECUTE ON FUNCTION public.hr_workforce_forecast_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_forecast_events() TO authenticated;

-- Daily workforce reconcile (01:15 IST) recorded in a migration, idempotent
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-workforce-reconcile-daily') THEN
    PERFORM cron.unschedule('hr-workforce-reconcile-daily');
  END IF;
  PERFORM cron.schedule('hr-workforce-reconcile-daily', '45 19 * * *', 'SELECT public.hr_wf_daily_reconcile();');
END $$;