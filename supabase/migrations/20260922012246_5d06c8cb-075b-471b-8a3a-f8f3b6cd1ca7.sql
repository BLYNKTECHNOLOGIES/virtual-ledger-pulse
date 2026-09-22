ALTER TABLE public.hr_headcount_plans
ADD COLUMN eligible_shift_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.hr_validate_shared_position_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.position_id IS NOT NULL AND cardinality(NEW.eligible_position_ids) > 0 AND NOT (NEW.position_id = ANY(NEW.eligible_position_ids)) THEN
    RAISE EXCEPTION 'The primary position must be included in the shared role scope';
  END IF;
  IF cardinality(NEW.eligible_position_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(NEW.eligible_position_ids))) THEN
    RAISE EXCEPTION 'The shared role scope cannot contain duplicate positions';
  END IF;
  IF TG_TABLE_NAME = 'hr_headcount_plans' THEN
    IF NEW.shift_id IS NOT NULL AND cardinality(NEW.eligible_shift_ids) > 0 AND NOT (NEW.shift_id = ANY(NEW.eligible_shift_ids)) THEN
      RAISE EXCEPTION 'The primary shift must be included in the combined shift scope';
    END IF;
    IF cardinality(NEW.eligible_shift_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(NEW.eligible_shift_ids))) THEN
      RAISE EXCEPTION 'The combined shift scope cannot contain duplicate shifts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_headcount_plan_shared_scope ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_headcount_plan_shared_scope
BEFORE INSERT OR UPDATE OF position_id,eligible_position_ids,shift_id,eligible_shift_ids
ON public.hr_headcount_plans
FOR EACH ROW EXECUTE FUNCTION public.hr_validate_shared_position_scope();

CREATE OR REPLACE FUNCTION public.hr_workforce_staffing_matrix()
RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH current_shift AS (
  SELECT DISTINCT ON (sch.employee_id) sch.employee_id,sch.shift_id
  FROM public.hr_employee_shift_schedule sch
  WHERE sch.is_current AND sch.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY sch.employee_id,sch.effective_from DESC,sch.created_at DESC
),
emp AS (
  SELECT w.department_id,w.job_position_id AS position_id,coalesce(cs.shift_id,w.shift_id) AS shift_id,e.resignation_status
  FROM public.hr_employee_work_info w
  JOIN public.hr_employees e ON e.id=w.employee_id AND e.is_active
  LEFT JOIN current_shift cs ON cs.employee_id=w.employee_id
),
reqs AS (
  SELECT hr.staffing_plan_id,count(*)::int AS open_count,coalesce(sum(greatest(hr.number_required-hr.positions_filled,0)),0)::int AS open_hc
  FROM public.hr_hiring_requirements hr
  WHERE hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
  GROUP BY hr.staffing_plan_id
),
cand AS (
  SELECT hr.staffing_plan_id,
    count(*) FILTER (WHERE NOT coalesce(c.hired,false) AND NOT coalesce(c.canceled,false) AND NOT coalesce(c.converted,false))::int AS pipeline_hc,
    count(*) FILTER (WHERE coalesce(c.hired,false) AND NOT coalesce(c.converted,false) AND c.joining_date IS NULL)::int AS selected_hc,
    count(*) FILTER (WHERE coalesce(c.hired,false) AND NOT coalesce(c.converted,false) AND c.joining_date IS NOT NULL)::int AS pending_joining_hc
  FROM public.hr_candidates c
  JOIN public.hr_recruitments r ON r.id=c.recruitment_id
  JOIN public.hr_hiring_requirements hr ON hr.recruitment_id=r.id
  GROUP BY hr.staffing_plan_id
)
SELECT p.id,p.department_id,d.name,p.position_id,
  CASE WHEN cardinality(p.eligible_position_ids)>1 THEN (
    SELECT string_agg(pos2.title,' / ' ORDER BY array_position(p.eligible_position_ids,pos2.id)) FROM public.positions pos2 WHERE pos2.id=ANY(p.eligible_position_ids)
  ) ELSE pos.title END,
  p.shift_id,coalesce(s.name,p.shift_label),p.location,p.employment_type,p.approved_hc,p.required_hc,
  coalesce((SELECT count(*) FROM emp e WHERE e.department_id IS NOT DISTINCT FROM p.department_id
    AND (CASE WHEN cardinality(p.eligible_position_ids)>0 THEN e.position_id=ANY(p.eligible_position_ids) ELSE e.position_id IS NOT DISTINCT FROM p.position_id END)
    AND (CASE WHEN cardinality(p.eligible_shift_ids)>0 THEN e.shift_id=ANY(p.eligible_shift_ids) WHEN p.shift_id IS NULL THEN true ELSE e.shift_id IS NOT DISTINCT FROM p.shift_id END)
    AND coalesce(e.resignation_status,'')<>'completed'),0)::int,
  coalesce((SELECT max(sc.physical_seats) FROM public.hr_seat_capacity sc WHERE sc.is_active AND NOT sc.is_training_only
    AND sc.department_id IS NOT DISTINCT FROM p.department_id
    AND (sc.shift_id IS NULL OR sc.shift_id IS NOT DISTINCT FROM p.shift_id)
    AND coalesce(sc.location,'-')=coalesce(p.location,'-')
    AND ((cardinality(p.eligible_position_ids)>0 AND cardinality(sc.eligible_position_ids)>0 AND p.eligible_position_ids&&sc.eligible_position_ids)
      OR (cardinality(p.eligible_position_ids)=0 AND cardinality(sc.eligible_position_ids)=0 AND sc.position_id IS NOT DISTINCT FROM p.position_id))),0)::int,
  coalesce(cand.pipeline_hc,0)::int,coalesce(cand.selected_hc,0)::int,coalesce(cand.pending_joining_hc,0)::int,
  coalesce((SELECT count(*) FROM emp e WHERE e.department_id IS NOT DISTINCT FROM p.department_id
    AND (CASE WHEN cardinality(p.eligible_position_ids)>0 THEN e.position_id=ANY(p.eligible_position_ids) ELSE e.position_id IS NOT DISTINCT FROM p.position_id END)
    AND (CASE WHEN cardinality(p.eligible_shift_ids)>0 THEN e.shift_id=ANY(p.eligible_shift_ids) WHEN p.shift_id IS NULL THEN true ELSE e.shift_id IS NOT DISTINCT FROM p.shift_id END)
    AND e.resignation_status='notice_period'),0)::int,
  p.target_date,p.priority,coalesce(reqs.open_count,0)::int,coalesce(reqs.open_hc,0)::int
FROM public.hr_headcount_plans p
LEFT JOIN public.departments d ON d.id=p.department_id
LEFT JOIN public.positions pos ON pos.id=p.position_id
LEFT JOIN public.hr_shifts s ON s.id=p.shift_id
LEFT JOIN reqs ON reqs.staffing_plan_id=p.id
LEFT JOIN cand ON cand.staffing_plan_id=p.id
WHERE p.is_active;
$$;

CREATE OR REPLACE FUNCTION public.hr_workforce_unplanned_scopes()
RETURNS TABLE(department_id uuid,department_name text,position_id uuid,position_title text,shift_id uuid,shift_name text,current_hc integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH current_shift AS (
  SELECT DISTINCT ON (sch.employee_id) sch.employee_id,sch.shift_id
  FROM public.hr_employee_shift_schedule sch
  WHERE sch.is_current AND sch.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY sch.employee_id,sch.effective_from DESC,sch.created_at DESC
)
SELECT w.department_id,d.name,w.job_position_id,pos.title,coalesce(cs.shift_id,w.shift_id),s.name,count(*)::int
FROM public.hr_employee_work_info w
JOIN public.hr_employees e ON e.id=w.employee_id AND e.is_active AND coalesce(e.resignation_status,'')<>'completed'
LEFT JOIN current_shift cs ON cs.employee_id=w.employee_id
LEFT JOIN public.departments d ON d.id=w.department_id
LEFT JOIN public.positions pos ON pos.id=w.job_position_id
LEFT JOIN public.hr_shifts s ON s.id=coalesce(cs.shift_id,w.shift_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_headcount_plans p
  WHERE p.is_active AND p.department_id IS NOT DISTINCT FROM w.department_id
    AND (p.position_id IS NOT DISTINCT FROM w.job_position_id OR w.job_position_id=ANY(p.eligible_position_ids))
    AND (p.shift_id IS NULL OR p.shift_id IS NOT DISTINCT FROM coalesce(cs.shift_id,w.shift_id) OR coalesce(cs.shift_id,w.shift_id)=ANY(p.eligible_shift_ids))
)
GROUP BY 1,2,3,4,5,6;
$$;

DROP TRIGGER IF EXISTS trg_hr_headcount_plan_reconcile ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_headcount_plan_reconcile
AFTER INSERT OR UPDATE OF department_id,position_id,eligible_position_ids,shift_id,eligible_shift_ids,location,approved_hc,required_hc,is_active
ON public.hr_headcount_plans FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();