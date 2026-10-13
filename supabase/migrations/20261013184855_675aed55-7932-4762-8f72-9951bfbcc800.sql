
CREATE OR REPLACE FUNCTION public.hr_workforce_leaving_soon()
RETURNS TABLE(employee_id uuid, department_id uuid, position_id uuid, plan_id uuid, last_working_day date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.employee_id, p.department_id, p.position_id,
    (SELECT b.plan_id FROM public.hr_wf_line_base() b WHERE b.department_id IS NOT DISTINCT FROM p.department_id
       AND p.position_id = ANY(b.roles) AND (cardinality(b.groups) = 0 OR p.group_id = ANY(b.groups))
     ORDER BY cardinality(b.groups) DESC LIMIT 1),
    coalesce(e.last_working_day, e.notice_period_end_date)
  FROM public.hr_wf_people() p JOIN public.hr_employees e ON e.id = p.employee_id
  WHERE p.resignation_status = 'notice_period' AND p.position_id IS NOT NULL
    AND (public.hr_wf_is_manager(auth.uid()) OR public.hr_is_hr_staff(auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.hr_workforce_leaving_soon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_leaving_soon() TO authenticated, service_role;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['hr_wf_position_guard()','hr_wf_position_lines_follow()','hr_wf_shift_group_overlap_guard()',
    'hr_wf_mark_change()','hr_wf_run_queued_reconcile()','hr_wf_queue_reconcile()','hr_wf_line_signature(uuid)','hr_wf_user_name(uuid)',
    'hr_wf_onboarding_people()','hr_wf_link_requirement_line()','hr_wf_audit_headcount()','hr_wf_audit_fill()','hr_wf_follow_desks()',
    'hr_reconcile_capacity_hiring(boolean)','hr_wf_trainee_allocation()','hr_wf_line_base()','hr_wf_requirement_people(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
