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
         coalesce(pp.resignation_status = 'notice_period', false), coalesce(e.last_working_day, e.notice_period_end_date),
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
         coalesce(e.resignation_status = 'notice_period', false), coalesce(e.last_working_day, e.notice_period_end_date),
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
REVOKE ALL ON FUNCTION public.hr_workforce_line_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_line_people(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.hr_wf_is_manager(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_wf_caller_is_internal() FROM authenticated;