
-- W2: workforce screens support functions
CREATE OR REPLACE FUNCTION public.hr_wf_caller_is_internal()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role') IS NULL
      OR coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role') = 'service_role'
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_is_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_permission(_uid, 'hrms_manage'::app_permission)
    OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
               WHERE ur.user_id = _uid AND lower(replace(replace(r.name,'_',' '),'-',' ')) IN ('admin','super admin','superadmin'))
  )
$$;

-- 1. People on a line
CREATE OR REPLACE FUNCTION public.hr_workforce_line_people(p_plan_id uuid)
RETURNS TABLE(kind text, employee_id uuid, full_name text, badge_id text, shift_name text,
              on_notice boolean, last_working_day date, ready_date date,
              post_training_shift_id uuid, post_training_shift_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l record;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_is_hr_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Only HR staff can see who is on a staffing line';
  END IF;
  SELECT p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) groups
    INTO l FROM public.hr_headcount_plans p WHERE p.id = p_plan_id AND p.is_active;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'on_roll'::text, e.id, nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), e.badge_id, s.name,
         (pp.resignation_status = 'notice_period'), coalesce(e.last_working_day, e.notice_period_end_date),
         NULL::date, NULL::uuid, NULL::text
  FROM public.hr_wf_people() pp
  JOIN public.hr_employees e ON e.id = pp.employee_id
  LEFT JOIN public.hr_shifts s ON s.id = pp.shift_id
  WHERE NOT pp.is_training
    AND pp.department_id IS NOT DISTINCT FROM l.department_id
    AND pp.position_id = ANY(l.roles)
    AND (cardinality(l.groups) = 0 OR pp.group_id = ANY(l.groups))
  ORDER BY 3;

  RETURN QUERY
  SELECT 'trainee'::text, e.id, nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), e.badge_id, s.name,
         (e.resignation_status = 'notice_period'), coalesce(e.last_working_day, e.notice_period_end_date),
         a.out_ready_date, o.post_training_shift_id, ps.name
  FROM public.hr_wf_trainee_allocation() a
  JOIN public.hr_employees e ON e.id = a.out_employee_id
  LEFT JOIN public.hr_wf_people() pp ON pp.employee_id = e.id
  LEFT JOIN public.hr_shifts s ON s.id = pp.shift_id
  LEFT JOIN LATERAL (SELECT ob.post_training_shift_id FROM public.hr_employee_onboarding ob
                     WHERE ob.employee_id = e.id AND ob.status <> 'cancelled' ORDER BY ob.created_at DESC LIMIT 1) o ON true
  LEFT JOIN public.hr_shifts ps ON ps.id = o.post_training_shift_id
  WHERE a.out_plan_id = p_plan_id
  ORDER BY 3;
END $$;

-- 2. All trainees
CREATE OR REPLACE FUNCTION public.hr_workforce_trainees()
RETURNS TABLE(employee_id uuid, full_name text, badge_id text, department_id uuid, department_name text,
              position_id uuid, position_title text, training_end_date date,
              post_training_shift_id uuid, post_training_shift_name text,
              plan_id uuid, line_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_is_hr_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Only HR staff can see trainees';
  END IF;
  RETURN QUERY
  WITH alloc AS (SELECT * FROM public.hr_wf_trainee_allocation()),
       base AS (SELECT b.plan_id, b.group_name FROM public.hr_wf_line_base() b)
  SELECT e.id, nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), e.badge_id,
         pp.department_id, d.name, pp.position_id, pos.title, o.training_completion_date,
         o.post_training_shift_id, ps.name, a.out_plan_id,
         CASE WHEN a.out_plan_id IS NULL THEN NULL ELSE concat_ws(' · ', pos.title, b.group_name) END
  FROM public.hr_wf_people() pp
  JOIN public.hr_employees e ON e.id = pp.employee_id
  LEFT JOIN public.departments d ON d.id = pp.department_id
  LEFT JOIN public.positions pos ON pos.id = pp.position_id
  LEFT JOIN LATERAL (SELECT ob.post_training_shift_id, ob.training_completion_date FROM public.hr_employee_onboarding ob
                     WHERE ob.employee_id = e.id AND ob.status <> 'cancelled' ORDER BY ob.created_at DESC LIMIT 1) o ON true
  LEFT JOIN public.hr_shifts ps ON ps.id = o.post_training_shift_id
  LEFT JOIN alloc a ON a.out_employee_id = e.id
  LEFT JOIN base b ON b.plan_id = a.out_plan_id
  WHERE pp.is_training
  ORDER BY o.training_completion_date NULLS LAST, 2;
END $$;

-- 3. After-training shift
CREATE OR REPLACE FUNCTION public.hr_set_post_training_shift(p_employee uuid, p_shift uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(auth.uid())) THEN
    RAISE EXCEPTION 'Only HRMS managers can set the after-training shift';
  END IF;
  IF p_shift IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hr_shifts WHERE id = p_shift AND is_active AND NOT is_training_shift) THEN
    RAISE EXCEPTION 'Choose an active shift that is not a training shift';
  END IF;
  SELECT id INTO v_id FROM public.hr_employee_onboarding
   WHERE employee_id = p_employee AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'This trainee has no onboarding record to store the after-training shift on';
  END IF;
  UPDATE public.hr_employee_onboarding SET post_training_shift_id = p_shift WHERE id = v_id;
END $$;

-- 4. Requirement status transitions
CREATE OR REPLACE FUNCTION public.hr_requirement_transition(p_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_uid uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')), ''); v_name text; v_new text;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(v_uid)) THEN
    RAISE EXCEPTION 'Only HRMS managers can change a hiring requirement''s status';
  END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;

  CASE lower(coalesce(p_action,''))
    WHEN 'submit' THEN
      IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted (this one is %)', replace(r.status,'_',' '); END IF;
      v_new := 'pending_approval';
      UPDATE public.hr_hiring_requirements SET status = v_new, notes = coalesce(v_reason, notes) WHERE id = p_id;
    WHEN 'approve' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be approved (this one is %)', replace(r.status,'_',' '); END IF;
      SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email) INTO v_name FROM public.users u WHERE u.id = v_uid;
      v_new := 'approved';
      UPDATE public.hr_hiring_requirements SET status = v_new, approver_id = v_uid,
        approver_name = coalesce(v_name, CASE WHEN v_uid IS NULL THEN 'System' END), approved_at = now(),
        rejection_reason = NULL, notes = coalesce(v_reason, notes) WHERE id = p_id;
    WHEN 'reject' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be rejected (this one is %)', replace(r.status,'_',' '); END IF;
      IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for rejecting this requirement'; END IF;
      v_new := 'rejected';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = v_reason WHERE id = p_id;
    WHEN 'cancel' THEN
      IF r.status NOT IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN
        RAISE EXCEPTION 'Only an open requirement can be cancelled (this one is %)', replace(r.status,'_',' ');
      END IF;
      IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for cancelling this requirement'; END IF;
      v_new := 'cancelled';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL, notes = v_reason WHERE id = p_id;
    WHEN 'reopen' THEN
      IF r.status NOT IN ('rejected','cancelled') THEN RAISE EXCEPTION 'Only a rejected or cancelled requirement can be reopened (this one is %)', replace(r.status,'_',' '); END IF;
      v_new := 'draft';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL, approver_id = NULL,
        approver_name = NULL, approved_at = NULL, notes = coalesce(v_reason, notes) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'Unknown action "%" — use submit, approve, reject, cancel or reopen', coalesce(p_action,'');
  END CASE;

  SELECT status INTO v_new FROM public.hr_hiring_requirements WHERE id = p_id;
  RETURN v_new;
END $$;

-- 5. Auto-link manual requirements to their line
CREATE OR REPLACE FUNCTION public.hr_wf_link_requirement_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_grp uuid; v_ids uuid[];
BEGIN
  IF NEW.staffing_plan_id IS NOT NULL OR NEW.department_id IS NULL OR NEW.position_id IS NULL THEN RETURN NEW; END IF;
  v_grp := public.hr_wf_planning_shift(NEW.shift_id);
  SELECT array_agg(p.id) INTO v_ids FROM public.hr_headcount_plans p
  WHERE p.is_active AND p.department_id = NEW.department_id
    AND NEW.position_id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))
    AND (cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
         OR (v_grp IS NOT NULL AND v_grp = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))));
  IF cardinality(v_ids) = 1 THEN NEW.staffing_plan_id := v_ids[1]; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_wf_link_requirement_line ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_link_requirement_line BEFORE INSERT ON public.hr_hiring_requirements
FOR EACH ROW EXECUTE FUNCTION public.hr_wf_link_requirement_line();

REVOKE ALL ON FUNCTION public.hr_wf_caller_is_internal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_wf_is_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_wf_link_requirement_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_workforce_line_people(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_workforce_trainees() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_set_post_training_shift(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_requirement_transition(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_caller_is_internal(), public.hr_wf_is_manager(uuid),
  public.hr_workforce_line_people(uuid), public.hr_workforce_trainees(),
  public.hr_set_post_training_shift(uuid, uuid), public.hr_requirement_transition(uuid, text, text)
  TO authenticated, service_role;
