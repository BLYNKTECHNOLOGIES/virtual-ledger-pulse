ALTER TABLE public.hr_seat_capacity
ADD COLUMN eligible_position_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.hr_headcount_plans
ADD COLUMN eligible_position_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.hr_validate_shared_position_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.position_id IS NOT NULL
     AND cardinality(NEW.eligible_position_ids) > 0
     AND NOT (NEW.position_id = ANY(NEW.eligible_position_ids)) THEN
    RAISE EXCEPTION 'The primary position must be included in the shared role scope';
  END IF;
  IF cardinality(NEW.eligible_position_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(NEW.eligible_position_ids))) THEN
    RAISE EXCEPTION 'The shared role scope cannot contain duplicate positions';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_seat_capacity_shared_scope
BEFORE INSERT OR UPDATE OF position_id, eligible_position_ids
ON public.hr_seat_capacity
FOR EACH ROW EXECUTE FUNCTION public.hr_validate_shared_position_scope();

CREATE TRIGGER trg_hr_headcount_plan_shared_scope
BEFORE INSERT OR UPDATE OF position_id, eligible_position_ids
ON public.hr_headcount_plans
FOR EACH ROW EXECUTE FUNCTION public.hr_validate_shared_position_scope();

CREATE OR REPLACE FUNCTION public.hr_workforce_staffing_matrix()
RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH current_shift AS (
  SELECT DISTINCT ON (sch.employee_id) sch.employee_id, sch.shift_id
  FROM public.hr_employee_shift_schedule sch
  WHERE sch.is_current
    AND sch.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY sch.employee_id, sch.effective_from DESC, sch.created_at DESC
),
emp AS (
  SELECT w.department_id,
         w.job_position_id AS position_id,
         coalesce(cs.shift_id, w.shift_id) AS shift_id,
         e.resignation_status
  FROM public.hr_employee_work_info w
  JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active
  LEFT JOIN current_shift cs ON cs.employee_id = w.employee_id
),
reqs AS (
  SELECT hr.staffing_plan_id,
         count(*)::int AS open_count,
         coalesce(sum(greatest(hr.number_required - hr.positions_filled, 0)), 0)::int AS open_hc
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
  JOIN public.hr_recruitments r ON r.id = c.recruitment_id
  JOIN public.hr_hiring_requirements hr ON hr.recruitment_id = r.id
  GROUP BY hr.staffing_plan_id
)
SELECT p.id,
       p.department_id,
       d.name,
       p.position_id,
       CASE WHEN cardinality(p.eligible_position_ids) > 1 THEN (
         SELECT string_agg(pos2.title, ' / ' ORDER BY array_position(p.eligible_position_ids, pos2.id))
         FROM public.positions pos2 WHERE pos2.id = ANY(p.eligible_position_ids)
       ) ELSE pos.title END,
       p.shift_id,
       coalesce(s.name, p.shift_label),
       p.location,
       p.employment_type,
       p.approved_hc,
       p.required_hc,
       coalesce((
         SELECT count(*) FROM emp e
         WHERE e.department_id IS NOT DISTINCT FROM p.department_id
           AND (CASE WHEN cardinality(p.eligible_position_ids) > 0 THEN e.position_id = ANY(p.eligible_position_ids) ELSE e.position_id IS NOT DISTINCT FROM p.position_id END)
           AND (p.shift_id IS NULL OR e.shift_id IS NOT DISTINCT FROM p.shift_id)
           AND coalesce(e.resignation_status,'') <> 'completed'
       ),0)::int,
       coalesce((
         SELECT max(sc.physical_seats)
         FROM public.hr_seat_capacity sc
         WHERE sc.is_active AND NOT sc.is_training_only
           AND sc.department_id IS NOT DISTINCT FROM p.department_id
           AND (sc.shift_id IS NULL OR sc.shift_id IS NOT DISTINCT FROM p.shift_id)
           AND coalesce(sc.location,'-') = coalesce(p.location,'-')
           AND (
             (cardinality(p.eligible_position_ids) > 0 AND cardinality(sc.eligible_position_ids) > 0 AND p.eligible_position_ids && sc.eligible_position_ids)
             OR (cardinality(p.eligible_position_ids) = 0 AND cardinality(sc.eligible_position_ids) = 0 AND sc.position_id IS NOT DISTINCT FROM p.position_id)
           )
       ),0)::int,
       coalesce(cand.pipeline_hc,0)::int,
       coalesce(cand.selected_hc,0)::int,
       coalesce(cand.pending_joining_hc,0)::int,
       coalesce((
         SELECT count(*) FROM emp e
         WHERE e.department_id IS NOT DISTINCT FROM p.department_id
           AND (CASE WHEN cardinality(p.eligible_position_ids) > 0 THEN e.position_id = ANY(p.eligible_position_ids) ELSE e.position_id IS NOT DISTINCT FROM p.position_id END)
           AND (p.shift_id IS NULL OR e.shift_id IS NOT DISTINCT FROM p.shift_id)
           AND e.resignation_status = 'notice_period'
       ),0)::int,
       p.target_date,
       p.priority,
       coalesce(reqs.open_count,0)::int,
       coalesce(reqs.open_hc,0)::int
FROM public.hr_headcount_plans p
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN reqs ON reqs.staffing_plan_id = p.id
LEFT JOIN cand ON cand.staffing_plan_id = p.id
WHERE p.is_active;
$$;

CREATE OR REPLACE FUNCTION public.hr_workforce_unplanned_scopes()
RETURNS TABLE(department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, current_hc integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH current_shift AS (
  SELECT DISTINCT ON (sch.employee_id) sch.employee_id, sch.shift_id
  FROM public.hr_employee_shift_schedule sch
  WHERE sch.is_current
    AND sch.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY sch.employee_id, sch.effective_from DESC, sch.created_at DESC
)
SELECT w.department_id, d.name, w.job_position_id, pos.title,
       coalesce(cs.shift_id, w.shift_id), s.name, count(*)::int
FROM public.hr_employee_work_info w
JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active AND coalesce(e.resignation_status,'') <> 'completed'
LEFT JOIN current_shift cs ON cs.employee_id = w.employee_id
LEFT JOIN public.departments d ON d.id = w.department_id
LEFT JOIN public.positions pos ON pos.id = w.job_position_id
LEFT JOIN public.hr_shifts s ON s.id = coalesce(cs.shift_id, w.shift_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_headcount_plans p
  WHERE p.is_active
    AND p.department_id IS NOT DISTINCT FROM w.department_id
    AND (p.position_id IS NOT DISTINCT FROM w.job_position_id OR w.job_position_id = ANY(p.eligible_position_ids))
    AND (p.shift_id IS NULL OR p.shift_id IS NOT DISTINCT FROM coalesce(cs.shift_id,w.shift_id))
)
GROUP BY 1,2,3,4,5,6;
$$;

CREATE OR REPLACE FUNCTION public.hr_reconcile_capacity_hiring(p_sync_plans boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  capacity_row record; matrix_row record; existing_plan_id uuid; pending_auto_id uuid;
  pending_auto_outstanding integer; committed_open integer; remaining_need integer; desired_auto integer;
  plans_created integer := 0; plans_updated integer := 0; requirements_created integer := 0;
  requirements_updated integer := 0; requirements_cancelled integer := 0; requirement_number text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));
  IF p_sync_plans THEN
    FOR capacity_row IN
      SELECT sc.department_id, sc.position_id, sc.shift_id, sc.location,
             max(sc.shift_label) AS shift_label,
             sum(coalesce(sc.max_operational_capacity,sc.physical_seats))::int AS operational_target
      FROM public.hr_seat_capacity sc
      WHERE sc.is_active AND NOT sc.is_training_only AND sc.position_id IS NOT NULL
        AND cardinality(sc.eligible_position_ids) <= 1
      GROUP BY sc.department_id,sc.position_id,sc.shift_id,sc.location
    LOOP
      SELECT hp.id INTO existing_plan_id FROM public.hr_headcount_plans hp
      WHERE hp.is_active AND hp.department_id IS NOT DISTINCT FROM capacity_row.department_id
        AND hp.position_id IS NOT DISTINCT FROM capacity_row.position_id
        AND hp.shift_id IS NOT DISTINCT FROM capacity_row.shift_id
        AND coalesce(hp.location,'-')=coalesce(capacity_row.location,'-') LIMIT 1;
      IF existing_plan_id IS NULL THEN
        INSERT INTO public.hr_headcount_plans(department_id,position_id,shift_id,shift_label,location,approved_hc,required_hc,priority,notes)
        VALUES(capacity_row.department_id,capacity_row.position_id,capacity_row.shift_id,capacity_row.shift_label,capacity_row.location,capacity_row.operational_target,capacity_row.operational_target,'high','System-created from operational seat capacity; policy target is 100% occupancy.')
        RETURNING id INTO existing_plan_id; plans_created:=plans_created+1;
      ELSE
        UPDATE public.hr_headcount_plans hp SET approved_hc=greatest(hp.approved_hc,capacity_row.operational_target),required_hc=greatest(hp.required_hc,capacity_row.operational_target)
        WHERE hp.id=existing_plan_id AND (hp.approved_hc<capacity_row.operational_target OR hp.required_hc<capacity_row.operational_target);
        IF FOUND THEN plans_updated:=plans_updated+1; END IF;
      END IF;
    END LOOP;
  END IF;
  FOR matrix_row IN SELECT * FROM public.hr_workforce_staffing_matrix() LOOP
    remaining_need:=greatest(matrix_row.required_hc-matrix_row.current_hc-matrix_row.selected_hc-matrix_row.pending_joining_hc,0);
    SELECT hr.id,greatest(hr.number_required-hr.positions_filled,0) INTO pending_auto_id,pending_auto_outstanding
    FROM public.hr_hiring_requirements hr WHERE hr.staffing_plan_id=matrix_row.plan_id AND hr.source='capacity_occupancy' AND hr.status='pending_approval' LIMIT 1;
    committed_open:=greatest(matrix_row.open_requirement_hc-coalesce(pending_auto_outstanding,0),0);
    desired_auto:=greatest(remaining_need-committed_open,0);
    IF pending_auto_id IS NOT NULL THEN
      IF desired_auto=0 THEN
        UPDATE public.hr_hiring_requirements SET status='cancelled',notes=concat_ws(E'\n',nullif(notes,''),'System-cancelled: the live shortage is now covered.') WHERE id=pending_auto_id;
        requirements_cancelled:=requirements_cancelled+1;
      ELSE
        UPDATE public.hr_hiring_requirements SET number_required=desired_auto,department_id=matrix_row.department_id,position_id=matrix_row.position_id,shift_id=matrix_row.shift_id,shift_label=matrix_row.shift_name,location=matrix_row.location,employment_type=matrix_row.employment_type,target_joining_date=matrix_row.target_date,
          priority=CASE WHEN matrix_row.required_hc>0 AND (desired_auto::numeric/matrix_row.required_hc)>=0.20 THEN 'critical' ELSE matrix_row.priority END,
          reason_notes=format('100%% operational occupancy: required %s, on roll %s, selected %s, joining pending %s, other open hiring %s.',matrix_row.required_hc,matrix_row.current_hc,matrix_row.selected_hc,matrix_row.pending_joining_hc,committed_open)
        WHERE id=pending_auto_id AND (number_required IS DISTINCT FROM desired_auto OR department_id IS DISTINCT FROM matrix_row.department_id OR position_id IS DISTINCT FROM matrix_row.position_id OR shift_id IS DISTINCT FROM matrix_row.shift_id);
        IF FOUND THEN requirements_updated:=requirements_updated+1; END IF;
      END IF;
    ELSIF desired_auto>0 THEN
      requirement_number:=public.hr_next_hiring_requirement_no();
      INSERT INTO public.hr_hiring_requirements(requirement_no,staffing_plan_id,source,department_id,position_id,shift_id,shift_label,location,employment_type,number_required,target_joining_date,reason,reason_notes,requested_by_name,approver_name,priority,status,notes)
      VALUES(requirement_number,matrix_row.plan_id,'capacity_occupancy',matrix_row.department_id,matrix_row.position_id,matrix_row.shift_id,matrix_row.shift_name,matrix_row.location,matrix_row.employment_type,desired_auto,matrix_row.target_date,'increased_workload',format('100%% operational occupancy: required %s, on roll %s, selected %s, joining pending %s, other open hiring %s.',matrix_row.required_hc,matrix_row.current_hc,matrix_row.selected_hc,matrix_row.pending_joining_hc,committed_open),'Workforce Planning System','HR Manager',CASE WHEN matrix_row.required_hc>0 AND (desired_auto::numeric/matrix_row.required_hc)>=0.20 THEN 'critical' ELSE matrix_row.priority END,'pending_approval','System-generated for an uncovered shared capacity-backed staffing shortage. Either eligible Payment Operations role may fill the shared plan.');
      requirements_created:=requirements_created+1;
    END IF;
    pending_auto_id:=NULL; pending_auto_outstanding:=0;
  END LOOP;
  RETURN jsonb_build_object('plans_created',plans_created,'plans_updated',plans_updated,'requirements_created',requirements_created,'requirements_updated',requirements_updated,'requirements_cancelled',requirements_cancelled);
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_seat_capacity_reconcile ON public.hr_seat_capacity;
CREATE TRIGGER trg_hr_seat_capacity_reconcile
AFTER INSERT OR UPDATE OF department_id,position_id,eligible_position_ids,shift_id,location,physical_seats,max_operational_capacity,is_active
ON public.hr_seat_capacity FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();

DROP TRIGGER IF EXISTS trg_hr_headcount_plan_reconcile ON public.hr_headcount_plans;
CREATE TRIGGER trg_hr_headcount_plan_reconcile
AFTER INSERT OR UPDATE OF department_id,position_id,eligible_position_ids,shift_id,location,approved_hc,required_hc,is_active
ON public.hr_headcount_plans FOR EACH STATEMENT EXECUTE FUNCTION public.hr_trigger_reconcile_capacity_hiring();

REVOKE ALL ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) TO service_role;