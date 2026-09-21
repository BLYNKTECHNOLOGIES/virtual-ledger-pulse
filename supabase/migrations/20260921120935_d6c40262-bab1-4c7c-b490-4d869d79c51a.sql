
-- ============ Workforce Planning module ============

-- 1. Headcount plan (approved vs required seats per dept/position/shift)
CREATE TABLE public.hr_headcount_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.hr_shifts(id) ON DELETE SET NULL,
  shift_label text,
  location text,
  employment_type text,
  approved_hc integer NOT NULL DEFAULT 0 CHECK (approved_hc >= 0),
  required_hc integer NOT NULL DEFAULT 0 CHECK (required_hc >= 0),
  target_date date,
  priority text NOT NULL DEFAULT 'medium',
  effective_from date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hr_headcount_plans_scope_uk
  ON public.hr_headcount_plans (department_id, position_id, coalesce(shift_id::text,'-'), coalesce(location,'-'))
  WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_headcount_plans TO authenticated;
GRANT ALL ON public.hr_headcount_plans TO service_role;
ALTER TABLE public.hr_headcount_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_plans_view ON public.hr_headcount_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY wf_plans_manage ON public.hr_headcount_plans FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- 2. Physical seat capacity (separate from headcount)
CREATE TABLE public.hr_seat_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.hr_shifts(id) ON DELETE SET NULL,
  shift_label text,
  location text,
  physical_seats integer NOT NULL DEFAULT 0 CHECK (physical_seats >= 0),
  max_operational_capacity integer CHECK (max_operational_capacity IS NULL OR max_operational_capacity >= 0),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_seat_capacity TO authenticated;
GRANT ALL ON public.hr_seat_capacity TO service_role;
ALTER TABLE public.hr_seat_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_seats_view ON public.hr_seat_capacity FOR SELECT TO authenticated USING (true);
CREATE POLICY wf_seats_manage ON public.hr_seat_capacity FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- 3. Hiring requirements — the bridge into Recruitment
CREATE TABLE public.hr_hiring_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_no text NOT NULL UNIQUE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.hr_shifts(id) ON DELETE SET NULL,
  shift_label text,
  location text,
  employment_type text,
  number_required integer NOT NULL DEFAULT 1 CHECK (number_required > 0),
  target_joining_date date,
  reason text NOT NULL DEFAULT 'new_business',
  reason_notes text,
  required_skills text,
  experience_required text,
  salary_min numeric,
  salary_max numeric,
  replacement_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approver_id uuid,
  approver_name text,
  approved_at timestamptz,
  rejection_reason text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'draft',
  recruitment_id uuid REFERENCES public.hr_recruitments(id) ON DELETE SET NULL,
  positions_filled integer NOT NULL DEFAULT 0 CHECK (positions_filled >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_hiring_req_status_chk CHECK (status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled','fulfilled','cancelled','rejected')),
  CONSTRAINT hr_hiring_req_priority_chk CHECK (priority IN ('critical','high','medium','low'))
);
CREATE INDEX hr_hiring_req_status_idx ON public.hr_hiring_requirements (status);
CREATE INDEX hr_hiring_req_scope_idx ON public.hr_hiring_requirements (department_id, position_id, shift_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_hiring_requirements TO authenticated;
GRANT ALL ON public.hr_hiring_requirements TO service_role;
ALTER TABLE public.hr_hiring_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_req_view ON public.hr_hiring_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY wf_req_manage ON public.hr_hiring_requirements FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- 4. Forecast assumptions (attrition planning inputs)
CREATE TABLE public.hr_workforce_forecast_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  expected_monthly_attrition_pct numeric NOT NULL DEFAULT 0 CHECK (expected_monthly_attrition_pct >= 0 AND expected_monthly_attrition_pct <= 100),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hr_wf_forecast_dept_uk ON public.hr_workforce_forecast_assumptions (coalesce(department_id::text,'ALL'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_workforce_forecast_assumptions TO authenticated;
GRANT ALL ON public.hr_workforce_forecast_assumptions TO service_role;
ALTER TABLE public.hr_workforce_forecast_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_assump_view ON public.hr_workforce_forecast_assumptions FOR SELECT TO authenticated USING (true);
CREATE POLICY wf_assump_manage ON public.hr_workforce_forecast_assumptions FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- 5. Audit trail for every planning change
CREATE TABLE public.hr_workforce_plan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid,
  field_changed text,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_wf_audit_entity_idx ON public.hr_workforce_plan_audit (entity, entity_id, changed_at DESC);
GRANT SELECT, INSERT ON public.hr_workforce_plan_audit TO authenticated;
GRANT ALL ON public.hr_workforce_plan_audit TO service_role;
ALTER TABLE public.hr_workforce_plan_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_audit_view ON public.hr_workforce_plan_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY wf_audit_insert ON public.hr_workforce_plan_audit FOR INSERT TO authenticated WITH CHECK (true);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.hr_wf_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_hr_headcount_plans_touch BEFORE UPDATE ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_touch_updated_at();
CREATE TRIGGER trg_hr_seat_capacity_touch BEFORE UPDATE ON public.hr_seat_capacity
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_touch_updated_at();
CREATE TRIGGER trg_hr_hiring_req_touch BEFORE UPDATE ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_touch_updated_at();
CREATE TRIGGER trg_hr_wf_assump_touch BEFORE UPDATE ON public.hr_workforce_forecast_assumptions
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_touch_updated_at();

-- auto audit headcount changes
CREATE OR REPLACE FUNCTION public.hr_wf_audit_headcount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.approved_hc IS DISTINCT FROM OLD.approved_hc THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('headcount_plan', NEW.id, 'Approved HC', OLD.approved_hc::text, NEW.approved_hc::text, NEW.notes, auth.uid());
    END IF;
    IF NEW.required_hc IS DISTINCT FROM OLD.required_hc THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('headcount_plan', NEW.id, 'Required HC', OLD.required_hc::text, NEW.required_hc::text, NEW.notes, auth.uid());
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Plan created', NULL,
            format('Approved %s / Required %s', NEW.approved_hc, NEW.required_hc), NEW.notes, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_hr_headcount_audit AFTER INSERT OR UPDATE ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_headcount();

CREATE OR REPLACE FUNCTION public.hr_wf_audit_requirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('hiring_requirement', NEW.id, 'Requirement created', NULL, NEW.requirement_no, NEW.reason, auth.uid());
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Status', OLD.status, NEW.status, coalesce(NEW.rejection_reason, NEW.notes), auth.uid());
    END IF;
    IF NEW.number_required IS DISTINCT FROM OLD.number_required THEN
      INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
      VALUES ('hiring_requirement', NEW.id, 'Number required', OLD.number_required::text, NEW.number_required::text, NEW.notes, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_hr_hiring_req_audit AFTER INSERT OR UPDATE ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_requirement();

-- requirement number generator
CREATE OR REPLACE FUNCTION public.hr_next_hiring_requirement_no()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq int;
BEGIN
  yr := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  SELECT coalesce(max(split_part(requirement_no, '-', 3)::int), 0) + 1 INTO seq
  FROM public.hr_hiring_requirements
  WHERE requirement_no LIKE 'HR-' || yr || '-%'
    AND split_part(requirement_no, '-', 3) ~ '^[0-9]+$';
  RETURN 'HR-' || yr || '-' || lpad(seq::text, 4, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_next_hiring_requirement_no() TO authenticated;

-- ============ derived staffing matrix (single source of truth) ============
CREATE OR REPLACE FUNCTION public.hr_workforce_staffing_matrix()
RETURNS TABLE (
  plan_id uuid,
  department_id uuid,
  department_name text,
  position_id uuid,
  position_title text,
  shift_id uuid,
  shift_name text,
  location text,
  employment_type text,
  approved_hc integer,
  required_hc integer,
  current_hc integer,
  physical_seats integer,
  pipeline_hc integer,
  selected_hc integer,
  pending_joining_hc integer,
  notice_period_hc integer,
  target_date date,
  priority text,
  open_requirement_count integer,
  open_requirement_hc integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH emp AS (
  SELECT w.department_id, w.job_position_id AS position_id, w.shift_id,
         count(*) FILTER (WHERE coalesce(e.resignation_status,'') <> 'completed')::int AS current_hc,
         count(*) FILTER (WHERE e.resignation_status = 'notice_period')::int AS notice_hc
  FROM public.hr_employee_work_info w
  JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active
  GROUP BY 1,2,3
),
cand AS (
  SELECT r.department_id, r.position_id,
         count(*) FILTER (WHERE NOT coalesce(c.hired,false) AND NOT coalesce(c.canceled,false) AND NOT coalesce(c.converted,false))::int AS pipeline_hc,
         count(*) FILTER (WHERE coalesce(c.hired,false) AND NOT coalesce(c.converted,false) AND c.joining_date IS NULL)::int AS selected_hc,
         count(*) FILTER (WHERE coalesce(c.hired,false) AND NOT coalesce(c.converted,false) AND c.joining_date IS NOT NULL)::int AS pending_joining_hc
  FROM public.hr_candidates c
  JOIN public.hr_recruitments r ON r.id = c.recruitment_id
  GROUP BY 1,2
),
reqs AS (
  SELECT department_id, position_id, shift_id,
         count(*)::int AS open_count,
         coalesce(sum(greatest(number_required - positions_filled, 0)),0)::int AS open_hc
  FROM public.hr_hiring_requirements
  WHERE status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
  GROUP BY 1,2,3
),
seats AS (
  SELECT department_id, position_id, shift_id, sum(physical_seats)::int AS physical_seats
  FROM public.hr_seat_capacity WHERE is_active GROUP BY 1,2,3
)
SELECT p.id, p.department_id, d.name, p.position_id, pos.title, p.shift_id,
       coalesce(s.name, p.shift_label), p.location, p.employment_type,
       p.approved_hc, p.required_hc,
       coalesce(emp.current_hc, 0),
       coalesce(seats.physical_seats, 0),
       coalesce(cand.pipeline_hc, 0), coalesce(cand.selected_hc, 0), coalesce(cand.pending_joining_hc, 0),
       coalesce(emp.notice_hc, 0),
       p.target_date, p.priority,
       coalesce(reqs.open_count, 0), coalesce(reqs.open_hc, 0)
FROM public.hr_headcount_plans p
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN emp ON emp.department_id = p.department_id AND emp.position_id = p.position_id
              AND (emp.shift_id = p.shift_id OR p.shift_id IS NULL)
LEFT JOIN cand ON cand.department_id = p.department_id AND cand.position_id = p.position_id
LEFT JOIN reqs ON reqs.department_id = p.department_id AND reqs.position_id = p.position_id
              AND (reqs.shift_id IS NOT DISTINCT FROM p.shift_id)
LEFT JOIN seats ON seats.department_id = p.department_id
              AND (seats.position_id IS NOT DISTINCT FROM p.position_id)
              AND (seats.shift_id IS NOT DISTINCT FROM p.shift_id)
WHERE p.is_active;
$$;
GRANT EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix() TO authenticated;

-- unplanned scopes: positions that hold employees but have no headcount plan yet
CREATE OR REPLACE FUNCTION public.hr_workforce_unplanned_scopes()
RETURNS TABLE (
  department_id uuid, department_name text, position_id uuid, position_title text,
  shift_id uuid, shift_name text, current_hc integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT w.department_id, d.name, w.job_position_id, pos.title, w.shift_id, s.name, count(*)::int
FROM public.hr_employee_work_info w
JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active AND coalesce(e.resignation_status,'') <> 'completed'
LEFT JOIN public.departments d ON d.id = w.department_id
LEFT JOIN public.positions pos ON pos.id = w.job_position_id
LEFT JOIN public.hr_shifts s ON s.id = w.shift_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_headcount_plans p
  WHERE p.is_active AND p.department_id IS NOT DISTINCT FROM w.department_id
    AND p.position_id IS NOT DISTINCT FROM w.job_position_id
)
GROUP BY 1,2,3,4,5,6;
$$;
GRANT EXECUTE ON FUNCTION public.hr_workforce_unplanned_scopes() TO authenticated;

-- requirement fulfilment progress, derived from recruitment
CREATE OR REPLACE FUNCTION public.hr_hiring_requirement_progress(p_requirement_id uuid)
RETURNS TABLE (
  applied integer, screened integer, interview integer, selected integer,
  joining_pending integer, joined integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH r AS (SELECT recruitment_id FROM public.hr_hiring_requirements WHERE id = p_requirement_id),
c AS (
  SELECT c.*, lower(coalesce(st.stage_type, st.stage_name, '')) AS stage
  FROM public.hr_candidates c
  LEFT JOIN public.hr_stages st ON st.id = c.stage_id
  WHERE c.recruitment_id = (SELECT recruitment_id FROM r)
)
SELECT count(*)::int,
       count(*) FILTER (WHERE stage LIKE '%screen%')::int,
       count(*) FILTER (WHERE stage LIKE '%interview%')::int,
       count(*) FILTER (WHERE coalesce(hired,false))::int,
       count(*) FILTER (WHERE coalesce(hired,false) AND NOT coalesce(converted,false))::int,
       count(*) FILTER (WHERE coalesce(converted,false))::int
FROM c;
$$;
GRANT EXECUTE ON FUNCTION public.hr_hiring_requirement_progress(uuid) TO authenticated;

-- create an approved requirement's recruitment opening
CREATE OR REPLACE FUNCTION public.hr_send_requirement_to_recruitment(p_requirement_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req public.hr_hiring_requirements; new_id uuid; pos_title text;
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR staff can open recruitment for a hiring requirement';
  END IF;
  SELECT * INTO req FROM public.hr_hiring_requirements WHERE id = p_requirement_id;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;
  IF req.status NOT IN ('approved','recruitment_active','partially_fulfilled') THEN
    RAISE EXCEPTION 'Requirement must be approved before recruitment can start';
  END IF;
  IF req.recruitment_id IS NOT NULL THEN RETURN req.recruitment_id; END IF;

  SELECT title INTO pos_title FROM public.positions WHERE id = req.position_id;
  INSERT INTO public.hr_recruitments (title, department_id, position_id, vacancy, job_type, location,
                                      salary_min, salary_max, requirements, description, is_published,
                                      start_date, end_date)
  VALUES (coalesce(pos_title,'Open role') || coalesce(' — ' || req.shift_label, '') || ' (' || req.requirement_no || ')',
          req.department_id, req.position_id, req.number_required, req.employment_type, req.location,
          req.salary_min, req.salary_max, req.required_skills,
          'Raised from workforce planning requirement ' || req.requirement_no, true,
          (now() AT TIME ZONE 'Asia/Kolkata')::date, req.target_joining_date)
  RETURNING id INTO new_id;

  UPDATE public.hr_hiring_requirements
  SET recruitment_id = new_id, status = 'recruitment_active'
  WHERE id = p_requirement_id;
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_send_requirement_to_recruitment(uuid) TO authenticated;

-- keep requirement fulfilment in step with candidate conversions
CREATE OR REPLACE FUNCTION public.hr_sync_requirement_fulfilment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req_id uuid; joined_cnt int; req_num int;
BEGIN
  SELECT id, number_required INTO req_id, req_num
  FROM public.hr_hiring_requirements
  WHERE recruitment_id = coalesce(NEW.recruitment_id, OLD.recruitment_id)
  LIMIT 1;
  IF req_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO joined_cnt FROM public.hr_candidates
  WHERE recruitment_id = coalesce(NEW.recruitment_id, OLD.recruitment_id) AND coalesce(converted,false);

  UPDATE public.hr_hiring_requirements
  SET positions_filled = joined_cnt,
      status = CASE
        WHEN joined_cnt >= req_num THEN 'fulfilled'
        WHEN joined_cnt > 0 THEN 'partially_fulfilled'
        ELSE status END
  WHERE id = req_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_hr_candidate_fulfilment AFTER INSERT OR UPDATE OF converted, hired ON public.hr_candidates
  FOR EACH ROW EXECUTE FUNCTION public.hr_sync_requirement_fulfilment();
