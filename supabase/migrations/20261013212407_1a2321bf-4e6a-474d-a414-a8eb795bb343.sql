CREATE OR REPLACE FUNCTION public.hr_my_department_staffing()
 RETURNS TABLE(department_id uuid, department_name text, plan_id uuid, position_title text, shift_label text, required_hc integer, on_roll_hc integer, short_hc integer, in_training_hc integer, requests jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid() AND auth.uid() IS NOT NULL AND e.is_active),
  depts AS (SELECT d.id, d.name FROM public.departments d JOIN me ON me.id = d.head_employee_id),
  tr AS (SELECT out_plan_id pid, count(*)::int n FROM public.hr_wf_trainee_allocation() GROUP BY 1)
  SELECT d.id, d.name, lb.plan_id, pos.title, lb.group_name, lb.required_hc, lb.current_hc,
    greatest(lb.required_hc - lb.current_hc, 0), coalesce(tr.n, 0),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'requirement_no', r.requirement_no, 'status', r.status,
        'number_required', r.number_required, 'source', r.source, 'requested_by_name', r.requested_by_name,
        'target_joining_date', r.target_joining_date, 'adds_headcount', r.adds_headcount) ORDER BY r.created_at DESC)
      FROM public.hr_hiring_requirements r WHERE r.staffing_plan_id = lb.plan_id
        AND (r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')
             OR (r.source = 'department_request' AND r.created_at > now() - interval '90 days'))), '[]'::jsonb)
  FROM depts d
  JOIN public.hr_wf_line_base() lb ON lb.department_id = d.id
  JOIN public.hr_headcount_plans hp ON hp.id = lb.plan_id
  LEFT JOIN public.positions pos ON pos.id = hp.position_id
  LEFT JOIN tr ON tr.pid = lb.plan_id
  ORDER BY d.name, pos.title, lb.group_start NULLS FIRST
$function$;