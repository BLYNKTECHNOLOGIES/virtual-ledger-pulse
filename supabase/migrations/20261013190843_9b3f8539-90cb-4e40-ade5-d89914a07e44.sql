CREATE OR REPLACE FUNCTION public.hr_workforce_attrition_history(p_department uuid DEFAULT NULL, p_months int DEFAULT 12)
RETURNS TABLE(month_start date, month_end date, opening_hc int, closing_hc int, joiners int, exits int, attrition_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_this date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.hr_wf_is_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only HR staff can view attrition history';
  END IF;
  RETURN QUERY
  WITH emp AS (
    SELECT w.joining_date AS jd, coalesce(e.last_working_day, e.termination_date) AS xd
    FROM public.hr_employees e
    JOIN public.hr_employee_work_info w ON w.employee_id = e.id
    JOIN public.positions pos ON pos.id = w.job_position_id AND pos.is_active AND pos.in_workforce_planning
    WHERE (e.is_active OR coalesce(e.last_working_day, e.termination_date) IS NOT NULL)
      AND (p_department IS NULL OR w.department_id = p_department)
  ),
  m AS (
    SELECT g::date AS ms, (g + interval '1 month' - interval '1 day')::date AS me
    FROM generate_series(v_this - make_interval(months => greatest(p_months,1)), v_this - interval '1 month', interval '1 month') g
  ),
  c AS (
    SELECT m.ms, m.me,
      (SELECT count(*) FROM emp WHERE (jd IS NULL OR jd <= m.ms) AND (xd IS NULL OR xd >= m.ms))::int o,
      (SELECT count(*) FROM emp WHERE (jd IS NULL OR jd <= m.me) AND (xd IS NULL OR xd > m.me))::int cl,
      (SELECT count(*) FROM emp WHERE jd BETWEEN m.ms AND m.me)::int j,
      (SELECT count(*) FROM emp WHERE xd BETWEEN m.ms AND m.me)::int x
    FROM m
  )
  SELECT c.ms, c.me, c.o, c.cl, c.j, c.x,
    CASE WHEN c.o + c.cl > 0 THEN round(c.x * 100.0 / ((c.o + c.cl) / 2.0), 2) ELSE 0 END
  FROM c ORDER BY c.ms;
END $$;

CREATE OR REPLACE FUNCTION public.hr_workforce_forecast_events()
RETURNS TABLE(kind text, plan_id uuid, department_id uuid, position_id uuid, event_date date, qty int,
              ref_id uuid, person_name text, badge_id text, role_title text, shift_name text,
              requirement_no text, requirement_status text, related_requirement_no text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.hr_wf_is_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only HR staff can view the workforce forecast';
  END IF;
  RETURN QUERY
  -- People on notice (same people and lines as the matrix / Overview)
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
  -- Confirmed joiners: in-progress onboarding with a joining date (one count per record)
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
  -- Trainees moving to the floor, on the line the matrix allocates them to
  SELECT 'trainee', ta.out_plan_id, p.department_id, p.position_id, ta.out_ready_date, 1,
    ta.out_employee_id, trim(concat_ws(' ', e.first_name, nullif(e.last_name,''))), e.badge_id::text, pos.title::text,
    NULL, NULL, NULL, NULL
  FROM public.hr_wf_trainee_allocation() ta
  JOIN public.hr_wf_people() p ON p.employee_id = ta.out_employee_id
  JOIN public.hr_employees e ON e.id = ta.out_employee_id
  LEFT JOIN public.positions pos ON pos.id = p.position_id
  UNION ALL
  -- Open requirements: people still to hire (joiners with a date are counted above)
  SELECT 'hire', r.staffing_plan_id, r.department_id, r.position_id, r.target_joining_date,
    greatest(r.number_required - r.positions_filled - coalesce(rp.joining_hc, 0), 0)::int,
    r.id, NULL, NULL, pos.title::text, r.shift_label::text, r.requirement_no::text, r.status::text, NULL
  FROM public.hr_hiring_requirements r
  LEFT JOIN public.hr_wf_requirement_people(NULL) rp ON rp.requirement_id = r.id
  LEFT JOIN public.positions pos ON pos.id = r.position_id
  WHERE r.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
    AND greatest(r.number_required - r.positions_filled - coalesce(rp.joining_hc, 0), 0) > 0;
END $$;

REVOKE EXECUTE ON FUNCTION public.hr_workforce_attrition_history(uuid,int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_workforce_forecast_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_attrition_history(uuid,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_workforce_forecast_events() TO authenticated, service_role;