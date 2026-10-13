ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS head_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL;

ALTER TABLE public.hr_hiring_requirements DROP CONSTRAINT hr_hiring_requirements_source_chk;
ALTER TABLE public.hr_hiring_requirements ADD CONSTRAINT hr_hiring_requirements_source_chk
  CHECK (source = ANY (ARRAY['manual','capacity_occupancy','employee_separation','department_request']));

-- Only HRMS managers (or server-side) may change who heads a department.
CREATE OR REPLACE FUNCTION public.hr_department_head_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.head_employee_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.head_employee_id ELSE NULL END)
     AND auth.uid() IS NOT NULL AND NOT public.hr_wf_is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only HRMS managers can set the head of a department';
  END IF;
  IF NEW.head_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = NEW.head_employee_id AND e.is_active) THEN
    RAISE EXCEPTION 'The head of department must be an active employee';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_department_head_guard ON public.departments;
CREATE TRIGGER trg_department_head_guard BEFORE INSERT OR UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.hr_department_head_guard();

-- Salary budget (aggregates only)
CREATE OR REPLACE FUNCTION public.hr_workforce_budget() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.hr_wf_is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only HRMS managers can view the salary budget';
  END IF;
  WITH lb AS (SELECT * FROM public.hr_wf_line_base()),
  ppl AS (
    SELECT p.*, nullif(e.total_salary, 0) / 12.0 AS ctc
    FROM public.hr_wf_people() p JOIN public.hr_employees e ON e.id = p.employee_id
    WHERE NOT p.is_training
  ),
  role_avg AS (SELECT position_id, avg(ctc) a FROM ppl WHERE ctc IS NOT NULL GROUP BY 1),
  rp AS (SELECT * FROM public.hr_wf_requirement_people(NULL)),
  rq AS (
    SELECT r.id, r.staffing_plan_id pid, r.position_id,
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
    SELECT rq.*, ra.a AS role_a,
      coalesce(rq.req_mid, rq.job_mid, ra.a) AS per_person,
      CASE WHEN rq.req_mid IS NOT NULL THEN 'requirement salary range'
           WHEN rq.job_mid IS NOT NULL THEN 'ATS job salary range'
           WHEN ra.a IS NOT NULL THEN 'role average CTC on record' ELSE 'no salary data' END AS basis
    FROM rq LEFT JOIN role_avg ra ON ra.position_id = rq.position_id
  ),
  line AS (
    SELECT lb.plan_id, lb.department_id, d.name AS department_name, hp.position_id, pos.title AS position_title,
      lb.group_name AS shift_label, lb.required_hc, lb.current_hc, lb.net_need, lb.open_hc,
      (SELECT sum(x.ctc) FROM ppl x WHERE x.department_id IS NOT DISTINCT FROM lb.department_id AND x.position_id = ANY(lb.roles)
         AND (cardinality(lb.groups) = 0 OR x.group_id = ANY(lb.groups))) AS on_roll_cost,
      (SELECT sum(c.ppl_open * c.per_person) FROM rqc c WHERE c.pid = lb.plan_id) AS hiring_cost,
      (SELECT sum(c.ppl_open) FROM rqc c WHERE c.pid = lb.plan_id) AS hiring_ppl,
      (SELECT c.per_person FROM rqc c WHERE c.pid = lb.plan_id AND c.per_person IS NOT NULL ORDER BY (c.basis <> 'role average CTC on record') DESC LIMIT 1) AS req_pp,
      (SELECT c.basis FROM rqc c WHERE c.pid = lb.plan_id AND c.per_person IS NOT NULL ORDER BY (c.basis <> 'role average CTC on record') DESC LIMIT 1) AS req_basis,
      (SELECT string_agg(DISTINCT c.basis, ', ') FROM rqc c WHERE c.pid = lb.plan_id) AS hiring_basis,
      (SELECT ra.a FROM role_avg ra WHERE ra.position_id = hp.position_id) AS role_pp
    FROM lb JOIN public.hr_headcount_plans hp ON hp.id = lb.plan_id
    LEFT JOIN public.departments d ON d.id = lb.department_id
    LEFT JOIN public.positions pos ON pos.id = hp.position_id
  ),
  l2 AS (
    SELECT l.*, coalesce(l.req_pp, l.role_pp) AS pp,
      CASE WHEN l.req_pp IS NOT NULL THEN l.req_basis WHEN l.role_pp IS NOT NULL THEN 'role average CTC on record' ELSE 'no salary data' END AS pp_basis,
      greatest(l.net_need - l.open_hc, 0) AS uncovered,
      greatest(l.required_hc - l.current_hc, 0) AS short
    FROM line l
  ),
  l3 AS (
    SELECT l2.*, coalesce(l2.on_roll_cost,0) + l2.short * coalesce(l2.pp,0) AS full_cost,
      l2.uncovered * coalesce(l2.pp,0) AS uncovered_cost
    FROM l2
  )
  SELECT jsonb_build_object(
    'company', (SELECT jsonb_build_object('on_roll_hc', sum(current_hc), 'on_roll_cost', round(sum(coalesce(on_roll_cost,0))),
        'hiring_hc', sum(coalesce(hiring_ppl,0)), 'hiring_cost', round(sum(coalesce(hiring_cost,0))),
        'uncovered_hc', sum(uncovered), 'uncovered_cost', round(sum(uncovered_cost)),
        'required_hc', sum(required_hc), 'full_cost', round(sum(full_cost))) FROM l3),
    'departments', coalesce((SELECT jsonb_agg(x ORDER BY x->>'department_name') FROM (
        SELECT jsonb_build_object('department_id', department_id, 'department_name', department_name,
          'on_roll_hc', sum(current_hc), 'on_roll_cost', round(sum(coalesce(on_roll_cost,0))),
          'hiring_hc', sum(coalesce(hiring_ppl,0)), 'hiring_cost', round(sum(coalesce(hiring_cost,0))),
          'uncovered_hc', sum(uncovered), 'uncovered_cost', round(sum(uncovered_cost)),
          'required_hc', sum(required_hc), 'full_cost', round(sum(full_cost))) x
        FROM l3 GROUP BY department_id, department_name) s), '[]'::jsonb),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object('plan_id', plan_id, 'department_id', department_id,
        'position_title', position_title, 'shift_label', shift_label, 'required_hc', required_hc, 'on_roll_hc', current_hc,
        -- one person on roll: their salary is only visible inside the department total
        'on_roll_cost', CASE WHEN current_hc >= 2 THEN round(on_roll_cost) END,
        'on_roll_avg', CASE WHEN current_hc >= 2 THEN round(on_roll_cost / current_hc) END,
        'hiring_hc', coalesce(hiring_ppl,0), 'hiring_cost', round(coalesce(hiring_cost,0)), 'hiring_basis', hiring_basis,
        'uncovered_hc', uncovered, 'uncovered_cost', round(uncovered_cost),
        'per_person', round(pp), 'per_person_basis', pp_basis,
        'full_cost', CASE WHEN current_hc >= 2 OR current_hc = 0 THEN round(full_cost) END,
        'grouped', current_hc = 1)) FROM l3), '[]'::jsonb),
    'requirements', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'people', ppl_open,
        'per_person', round(per_person), 'basis', basis)) FROM rqc), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

-- Department head: own departments' lines (no salary)
CREATE OR REPLACE FUNCTION public.hr_my_department_staffing()
RETURNS TABLE(department_id uuid, department_name text, plan_id uuid, position_title text, shift_label text,
  required_hc int, on_roll_hc int, short_hc int, in_training_hc int, requests jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH me AS (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid() AND auth.uid() IS NOT NULL AND e.is_active),
  depts AS (SELECT d.id, d.name FROM public.departments d JOIN me ON me.id = d.head_employee_id),
  tr AS (SELECT out_plan_id pid, count(*)::int n FROM public.hr_wf_trainee_allocation() GROUP BY 1)
  SELECT d.id, d.name, lb.plan_id, pos.title, lb.group_name, lb.required_hc, lb.current_hc,
    greatest(lb.required_hc - lb.current_hc, 0), coalesce(tr.n, 0),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'requirement_no', r.requirement_no, 'status', r.status,
        'number_required', r.number_required, 'source', r.source, 'requested_by_name', r.requested_by_name,
        'target_joining_date', r.target_joining_date) ORDER BY r.created_at DESC)
      FROM public.hr_hiring_requirements r WHERE r.staffing_plan_id = lb.plan_id
        AND (r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')
             OR (r.source = 'department_request' AND r.created_at > now() - interval '90 days'))), '[]'::jsonb)
  FROM depts d
  JOIN public.hr_wf_line_base() lb ON lb.department_id = d.id
  JOIN public.hr_headcount_plans hp ON hp.id = lb.plan_id
  LEFT JOIN public.positions pos ON pos.id = hp.position_id
  LEFT JOIN tr ON tr.pid = lb.plan_id
  ORDER BY d.name, pos.title, lb.group_start NULLS FIRST
$$;

CREATE OR REPLACE FUNCTION public.hr_department_request_hiring(p_plan_id uuid, p_number int, p_target date, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me record; v_plan record; v_open text; v_no text; v_id uuid;
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
  IF p_number IS NULL OR p_number < 1 OR p_number > v_plan.required_hc THEN
    RAISE EXCEPTION 'Ask for between 1 and % people (this line requires %)', greatest(v_plan.required_hc,1), v_plan.required_hc;
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
    staffing_plan_id, requested_by, requested_by_name)
  VALUES (v_no, v_plan.department_id, v_plan.position_id, v_plan.shift_id, v_plan.shift_label, v_plan.location,
    v_plan.employment_type, p_number, p_target, coalesce(v_plan.priority, 'medium'), 'increased_workload', trim(p_reason),
    'department_request', 'pending_approval', p_plan_id, auth.uid(), v_me.name)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'requirement_no', v_no);
END $$;

REVOKE EXECUTE ON FUNCTION public.hr_workforce_budget() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_my_department_staffing() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_department_request_hiring(uuid,int,date,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_department_head_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_workforce_budget() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_my_department_staffing() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_department_request_hiring(uuid,int,date,text) TO authenticated, service_role;