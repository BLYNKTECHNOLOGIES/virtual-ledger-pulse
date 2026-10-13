
-- 1. Selected/joining/joined helper: hired with a cancelled onboarding is no longer selected
CREATE OR REPLACE FUNCTION public.hr_wf_requirement_people(p_requirement uuid DEFAULT NULL::uuid)
 RETURNS TABLE(requirement_id uuid, pipeline_hc integer, selected_hc integer, joining_hc integer, joined_hc integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
SELECT j.requisition_id,
  count(*) FILTER (WHERE a.status IN ('active','on_hold'))::int,
  count(*) FILTER (WHERE a.status = 'hired' AND NOT x.joined AND NOT x.joining AND NOT x.cancelled)::int,
  count(*) FILTER (WHERE x.joining AND NOT x.joined)::int,
  count(*) FILTER (WHERE x.joined)::int
FROM public.ats_jobs j
JOIN public.ats_applications a ON a.job_id = j.id
CROSS JOIN LATERAL (SELECT
  EXISTS (SELECT 1 FROM public.hr_employee_onboarding o
           WHERE o.ats_application_id = a.id AND o.status = 'completed' AND o.employee_id IS NOT NULL) AS joined,
  EXISTS (SELECT 1 FROM public.hr_employee_onboarding o
           WHERE o.ats_application_id = a.id AND o.status NOT IN ('completed','cancelled')
             AND o.date_of_joining IS NOT NULL) AS joining,
  (EXISTS (SELECT 1 FROM public.hr_employee_onboarding o WHERE o.ats_application_id = a.id AND o.status = 'cancelled')
   AND NOT EXISTS (SELECT 1 FROM public.hr_employee_onboarding o WHERE o.ats_application_id = a.id AND o.status <> 'cancelled')) AS cancelled) x
WHERE j.requisition_id IS NOT NULL AND (p_requirement IS NULL OR j.requisition_id = p_requirement)
GROUP BY j.requisition_id
$function$;

-- 2. ATS hire -> onboarding draft hand-off
CREATE OR REPLACE FUNCTION public.hr_ats_hire_handoff()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_actor text := public.ats_actor_name(auth.uid());
  c record; j record; rq record; o record; v_first text; v_last text; v_shift uuid; v_type text; v_id uuid; v_sids uuid[];
BEGIN
  IF NEW.status = 'hired' AND OLD.status IS DISTINCT FROM 'hired' THEN
    SELECT * INTO o FROM public.hr_employee_onboarding WHERE ats_application_id = NEW.id ORDER BY (status = 'cancelled'), created_at LIMIT 1;
    IF FOUND THEN
      IF o.status = 'cancelled' THEN
        UPDATE public.hr_employee_onboarding SET status = 'draft', updated_at = now() WHERE id = o.id;
        INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
        VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding draft restored',
                jsonb_build_object('onboarding_id', o.id), v_uid, v_actor);
      END IF;
      RETURN NULL;
    END IF;
    SELECT * INTO c FROM public.ats_candidates WHERE id = NEW.candidate_id;
    SELECT * INTO j FROM public.ats_jobs WHERE id = NEW.job_id;
    IF j.requisition_id IS NOT NULL THEN SELECT * INTO rq FROM public.hr_hiring_requirements WHERE id = j.requisition_id; END IF;
    v_first := split_part(btrim(coalesce(c.full_name,'')), ' ', 1);
    v_last := btrim(substr(btrim(coalesce(c.full_name,'')), length(v_first) + 1));
    v_shift := rq.shift_id;
    IF v_shift IS NULL AND cardinality(coalesce(NEW.preferred_shifts, '{}')) = 1 THEN
      SELECT s.id INTO v_shift FROM public.hr_shifts s
       WHERE s.id::text = NEW.preferred_shifts[1] OR lower(s.name) = lower(btrim(NEW.preferred_shifts[1])) LIMIT 1;
    END IF;
    v_sids := coalesce(j.shift_ids, '{}');
    IF v_shift IS NULL AND cardinality(v_sids) = 1 THEN v_shift := v_sids[1]; END IF;
    v_type := CASE lower(coalesce(j.employment_type, rq.employment_type, ''))
      WHEN 'contract' THEN 'contract' WHEN 'intern' THEN 'intern' WHEN 'internship' THEN 'intern' ELSE 'full_time' END;
    INSERT INTO public.hr_employee_onboarding (status, current_stage, first_name, last_name, email, phone,
      department_id, position_id, shift_id, employee_type, created_by, ats_application_id)
    VALUES ('draft', 1, nullif(v_first,''), coalesce(v_last,''), c.email, c.phone,
      coalesce(j.department_id, rq.department_id), coalesce(j.position_id, rq.position_id), v_shift, v_type, v_uid, NEW.id)
    RETURNING id INTO v_id;
    INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
    VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding draft created',
            jsonb_build_object('onboarding_id', v_id), v_uid, v_actor);
  ELSIF OLD.status = 'hired' AND NEW.status IS DISTINCT FROM 'hired' THEN
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
REVOKE ALL ON FUNCTION public.hr_ats_hire_handoff() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_ats_hire_handoff ON public.ats_applications;
CREATE TRIGGER trg_hr_ats_hire_handoff AFTER UPDATE OF status ON public.ats_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_ats_hire_handoff();

-- 3. Notes helper
CREATE OR REPLACE FUNCTION public.hr_wf_note_line(p_verb text, p_uid uuid, p_text text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT format('%s by %s, %s: %s', p_verb,
    coalesce((SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email) FROM public.users u WHERE u.id = p_uid),
             CASE WHEN p_uid IS NULL THEN 'System' ELSE 'unknown user' END),
    to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY'), p_text)
$$;
REVOKE ALL ON FUNCTION public.hr_wf_note_line(text,uuid,text) FROM PUBLIC, anon, authenticated;

-- 4. Transition: append notes instead of replacing
CREATE OR REPLACE FUNCTION public.hr_requirement_transition(p_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_uid uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')), ''); v_name text; v_new text;
  v_line text;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(v_uid)) THEN
    RAISE EXCEPTION 'Only HRMS managers can change a hiring requirement''s status';
  END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;
  PERFORM set_config('hr.wf_change_reason', coalesce(v_reason, ''), true);

  CASE lower(coalesce(p_action,''))
    WHEN 'submit' THEN
      IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted (this one is %)', replace(r.status,'_',' '); END IF;
      v_new := 'pending_approval';
      v_line := CASE WHEN v_reason IS NOT NULL THEN public.hr_wf_note_line('Submitted', v_uid, v_reason) END;
      UPDATE public.hr_hiring_requirements SET status = v_new, notes = concat_ws(E'\n', nullif(notes,''), v_line) WHERE id = p_id;
    WHEN 'approve' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be approved (this one is %)', replace(r.status,'_',' '); END IF;
      SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email) INTO v_name FROM public.users u WHERE u.id = v_uid;
      v_new := 'approved';
      v_line := CASE WHEN v_reason IS NOT NULL THEN public.hr_wf_note_line('Approved', v_uid, v_reason) END;
      UPDATE public.hr_hiring_requirements SET status = v_new, approver_id = v_uid,
        approver_name = coalesce(v_name, CASE WHEN v_uid IS NULL THEN 'System' END), approved_at = now(),
        rejection_reason = NULL, notes = concat_ws(E'\n', nullif(notes,''), v_line) WHERE id = p_id;
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
  PERFORM set_config('hr.wf_change_reason', '', true);
  SELECT status INTO v_new FROM public.hr_hiring_requirements WHERE id = p_id;
  RETURN v_new;
END $function$;

-- 5. Audit: prefer the explicit reason; record more fields
CREATE OR REPLACE FUNCTION public.hr_wf_audit_requirement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a uuid := auth.uid(); v_r text := nullif(current_setting('hr.wf_change_reason', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('hiring_requirement', NEW.id, 'Requirement created', NULL, NEW.requirement_no, coalesce(NEW.reason_notes, NEW.reason), a);
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Status', OLD.status, NEW.status, coalesce(v_r, NEW.rejection_reason), a);
    END IF;
    IF NEW.number_required IS DISTINCT FROM OLD.number_required THEN
      INSERT INTO public.hr_workforce_plan_audit VALUES (DEFAULT, 'hiring_requirement', NEW.id, 'Number required', OLD.number_required::text, NEW.number_required::text, v_r, a);
    END IF;
    IF NEW.target_joining_date IS DISTINCT FROM OLD.target_joining_date THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Target joining date', OLD.target_joining_date::text, NEW.target_joining_date::text, v_r, a);
    END IF;
    IF NEW.shift_id IS DISTINCT FROM OLD.shift_id THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Shift', OLD.shift_label, NEW.shift_label, v_r, a);
    END IF;
    IF NEW.salary_min IS DISTINCT FROM OLD.salary_min OR NEW.salary_max IS DISTINCT FROM OLD.salary_max THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Salary range', concat_ws(' – ', OLD.salary_min, OLD.salary_max), concat_ws(' – ', NEW.salary_min, NEW.salary_max), v_r, a);
    END IF;
    IF NEW.required_skills IS DISTINCT FROM OLD.required_skills THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Skills', OLD.required_skills, NEW.required_skills, v_r, a);
    END IF;
    IF NEW.staffing_plan_id IS DISTINCT FROM OLD.staffing_plan_id THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Staffing line', OLD.staffing_plan_id::text, NEW.staffing_plan_id::text, v_r, a);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 6. Audited edit
CREATE OR REPLACE FUNCTION public.hr_update_requirement(p_id uuid, p_patch jsonb, p_reason text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_uid uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_full boolean; k text; v_limited text[] := ARRAY['number_required','target_joining_date','salary_min','salary_max','required_skills','notes'];
  v_all text[] := ARRAY['number_required','target_joining_date','salary_min','salary_max','required_skills','notes',
    'department_id','position_id','shift_id','shift_label','location','employment_type','reason','reason_notes',
    'experience_required','priority','staffing_plan_id','replacement_employee_id'];
BEGIN
  IF NOT public.hr_wf_is_manager(v_uid) THEN RAISE EXCEPTION 'Only HRMS managers can edit a hiring requirement'; END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;
  v_full := r.status IN ('draft','pending_approval');
  IF NOT v_full AND r.status NOT IN ('approved','recruitment_active','partially_fulfilled') THEN
    RAISE EXCEPTION 'A % requirement cannot be edited — reopen it first', replace(r.status,'_',' ');
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(CASE WHEN v_full THEN v_all ELSE v_limited END)) THEN
      RAISE EXCEPTION 'Field "%" cannot be changed once a requirement is approved', k;
    END IF;
  END LOOP;
  IF NOT v_full AND v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for changing an approved requirement'; END IF;
  PERFORM set_config('hr.wf_change_reason', coalesce(v_reason, ''), true);
  UPDATE public.hr_hiring_requirements h SET
    number_required = CASE WHEN p_patch ? 'number_required' THEN (p_patch->>'number_required')::int ELSE h.number_required END,
    target_joining_date = CASE WHEN p_patch ? 'target_joining_date' THEN nullif(p_patch->>'target_joining_date','')::date ELSE h.target_joining_date END,
    salary_min = CASE WHEN p_patch ? 'salary_min' THEN nullif(p_patch->>'salary_min','')::numeric ELSE h.salary_min END,
    salary_max = CASE WHEN p_patch ? 'salary_max' THEN nullif(p_patch->>'salary_max','')::numeric ELSE h.salary_max END,
    required_skills = CASE WHEN p_patch ? 'required_skills' THEN p_patch->>'required_skills' ELSE h.required_skills END,
    notes = CASE WHEN p_patch ? 'notes' THEN p_patch->>'notes' ELSE h.notes END,
    department_id = CASE WHEN p_patch ? 'department_id' THEN nullif(p_patch->>'department_id','')::uuid ELSE h.department_id END,
    position_id = CASE WHEN p_patch ? 'position_id' THEN nullif(p_patch->>'position_id','')::uuid ELSE h.position_id END,
    shift_id = CASE WHEN p_patch ? 'shift_id' THEN nullif(p_patch->>'shift_id','')::uuid ELSE h.shift_id END,
    shift_label = CASE WHEN p_patch ? 'shift_label' THEN p_patch->>'shift_label' ELSE h.shift_label END,
    location = CASE WHEN p_patch ? 'location' THEN p_patch->>'location' ELSE h.location END,
    employment_type = CASE WHEN p_patch ? 'employment_type' THEN p_patch->>'employment_type' ELSE h.employment_type END,
    reason = CASE WHEN p_patch ? 'reason' THEN p_patch->>'reason' ELSE h.reason END,
    reason_notes = CASE WHEN p_patch ? 'reason_notes' THEN p_patch->>'reason_notes' ELSE h.reason_notes END,
    experience_required = CASE WHEN p_patch ? 'experience_required' THEN p_patch->>'experience_required' ELSE h.experience_required END,
    priority = CASE WHEN p_patch ? 'priority' THEN p_patch->>'priority' ELSE h.priority END,
    staffing_plan_id = CASE WHEN p_patch ? 'staffing_plan_id' THEN nullif(p_patch->>'staffing_plan_id','')::uuid ELSE h.staffing_plan_id END,
    replacement_employee_id = CASE WHEN p_patch ? 'replacement_employee_id' THEN nullif(p_patch->>'replacement_employee_id','')::uuid ELSE h.replacement_employee_id END
  WHERE h.id = p_id;
  IF NOT v_full AND v_reason IS NOT NULL THEN
    UPDATE public.hr_hiring_requirements SET notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Edited', v_uid, v_reason)) WHERE id = p_id;
  END IF;
  PERFORM set_config('hr.wf_change_reason', '', true);
  PERFORM public.hr_wf_refresh_requirement(p_id);
END $function$;
REVOKE ALL ON FUNCTION public.hr_update_requirement(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_update_requirement(uuid,jsonb,text) TO authenticated, service_role;

-- 7. Pipeline / funnel per requirement (counts only)
CREATE OR REPLACE FUNCTION public.hr_requirement_pipeline(p_requirement uuid DEFAULT NULL)
 RETURNS TABLE(requirement_id uuid, applied int, new_hc int, screening int, assessment int, interview int, offer int,
   hired int, joining int, joined int, still_needed int)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH apps AS (
  SELECT j.requisition_id rid, a.status, st.code
  FROM public.ats_jobs j JOIN public.ats_applications a ON a.job_id = j.id
  LEFT JOIN public.ats_stages st ON st.id = a.stage_id
  WHERE j.requisition_id IS NOT NULL AND (p_requirement IS NULL OR j.requisition_id = p_requirement)
), f AS (
  SELECT rid, count(*)::int applied,
    count(*) FILTER (WHERE status IN ('active','on_hold') AND code = 'new')::int n,
    count(*) FILTER (WHERE status IN ('active','on_hold') AND code = 'screening')::int sc,
    count(*) FILTER (WHERE status IN ('active','on_hold') AND code = 'assessment')::int asm,
    count(*) FILTER (WHERE status IN ('active','on_hold') AND code = 'interview')::int iv,
    count(*) FILTER (WHERE status IN ('active','on_hold') AND code = 'offer')::int ofr
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
REVOKE ALL ON FUNCTION public.hr_requirement_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_requirement_pipeline(uuid) TO authenticated, service_role;

-- 8. Replacement requirement
CREATE OR REPLACE FUNCTION public.hr_raise_replacement_requirement(p_employee uuid, p_reason text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); e record; w record; v_id uuid; v_shift uuid; v_grp uuid; v_line uuid; v_date date;
  v_name text; v_by text; v_notes text;
BEGIN
  IF NOT public.hr_wf_is_manager(v_uid) THEN RAISE EXCEPTION 'Only HRMS managers can raise a replacement requirement'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('hr_replacement:' || p_employee::text));
  SELECT id INTO v_id FROM public.hr_hiring_requirements
   WHERE replacement_employee_id = p_employee AND source = 'employee_separation'
     AND status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO e FROM public.hr_employees WHERE id = p_employee;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO w FROM public.hr_employee_work_info WHERE employee_id = p_employee LIMIT 1;
  SELECT p.shift_id INTO v_shift FROM public.hr_wf_people() p WHERE p.employee_id = p_employee;
  v_shift := coalesce(v_shift, w.shift_id);
  v_grp := public.hr_wf_planning_shift(v_shift);
  SELECT b.plan_id INTO v_line FROM public.hr_wf_line_base() b
   WHERE b.department_id IS NOT DISTINCT FROM w.department_id AND w.job_position_id = ANY(b.roles)
     AND (cardinality(b.groups) = 0 OR v_grp = ANY(b.groups))
   ORDER BY cardinality(b.groups) DESC LIMIT 1;
  v_date := coalesce(e.last_working_day, e.notice_period_end_date);
  v_name := nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), '');
  SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email) INTO v_by FROM public.users u WHERE u.id = v_uid;
  v_notes := format('Replacement for %s (%s), last working day %s', coalesce(v_name,'employee'), coalesce(e.badge_id,'no badge'),
                    coalesce(to_char(v_date, 'DD Mon YYYY'), 'not set'));
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NOT NULL THEN v_notes := v_notes || '. ' || btrim(p_reason); END IF;
  INSERT INTO public.hr_hiring_requirements (requirement_no, department_id, position_id, shift_id, shift_label, employment_type,
    number_required, target_joining_date, reason, reason_notes, replacement_employee_id, requested_by, requested_by_name, requested_at,
    priority, status, staffing_plan_id, source)
  VALUES (public.hr_next_hiring_requirement_no(), w.department_id, w.job_position_id, v_shift,
    (SELECT name FROM public.hr_shifts WHERE id = v_shift), 'full_time', 1, v_date, 'replacement', v_notes, p_employee,
    v_uid, v_by, now(), 'high', 'pending_approval', v_line, 'employee_separation')
  RETURNING id INTO v_id;
  -- keep "no line" explicit when none covers this person (the insert trigger may otherwise guess)
  IF v_line IS NULL THEN UPDATE public.hr_hiring_requirements SET staffing_plan_id = NULL WHERE id = v_id AND staffing_plan_id IS NOT NULL; END IF;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.hr_raise_replacement_requirement(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_raise_replacement_requirement(uuid,text) TO authenticated, service_role;

-- 9. Withdrawn/rejected resignation -> cancel pending replacement
CREATE OR REPLACE FUNCTION public.hr_wf_resignation_withdrawn()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(OLD.resignation_status,'') <> '' AND coalesce(NEW.resignation_status,'') = '' THEN
    PERFORM set_config('hr.wf_change_reason', 'Resignation withdrawn', true);
    UPDATE public.hr_hiring_requirements
       SET status = 'cancelled', notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Cancelled', auth.uid(), 'resignation withdrawn'))
     WHERE replacement_employee_id = NEW.id AND source = 'employee_separation' AND status IN ('draft','pending_approval');
    UPDATE public.hr_hiring_requirements
       SET notes = concat_ws(E'\n', nullif(notes,''), 'Resignation withdrawn — review this requirement')
     WHERE replacement_employee_id = NEW.id AND source = 'employee_separation'
       AND status IN ('approved','recruitment_active','partially_fulfilled');
    PERFORM set_config('hr.wf_change_reason', '', true);
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_resignation_withdrawn() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_wf_resignation_withdrawn ON public.hr_employees;
CREATE TRIGGER trg_hr_wf_resignation_withdrawn AFTER UPDATE OF resignation_status ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_resignation_withdrawn();

-- 10. Matrix: replacements for people still on notice are not over-requests
CREATE OR REPLACE FUNCTION public.hr_workforce_staffing_matrix()
 RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer, shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date, over_requested_hc integer)
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
)
SELECT p.id, p.department_id, d.name, p.position_id,
  CASE WHEN cardinality(p.eligible_position_ids) > 1 THEN (
    SELECT string_agg(pos2.title, ' / ' ORDER BY array_position(p.eligible_position_ids, pos2.id))
    FROM public.positions pos2 WHERE pos2.id = ANY(p.eligible_position_ids)) ELSE pos.title END,
  p.shift_id, coalesce(s.name, p.shift_label), p.location, p.employment_type, p.approved_hc, p.required_hc,
  b.current_hc, coalesce(sc.physical_seats, 0), b.pipeline_hc, b.selected_hc, b.joining_hc, b.notice_hc,
  p.target_date, p.priority, b.open_count, b.open_hc,
  b.group_name, p.seat_capacity_id, p.follow_desks, coalesce(tr.n, 0), tr.rd,
  greatest(b.committed_hc - greatest(b.net_need - coalesce(tr.n, 0), 0) - least(b.notice_hc, coalesce(rep.n, 0)), 0)
FROM public.hr_headcount_plans p
JOIN b ON b.plan_id = p.id
LEFT JOIN tr ON tr.pid = p.id
LEFT JOIN rep ON rep.pid = p.id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN public.hr_seat_capacity sc ON sc.id = p.seat_capacity_id
WHERE p.is_active
$function$;
