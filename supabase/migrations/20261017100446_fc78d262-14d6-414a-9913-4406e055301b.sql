CREATE OR REPLACE FUNCTION public.hr_wf_rehome_line(p_plan uuid, p_seat uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NOT private.hr_wf_is_current_manager() THEN RAISE EXCEPTION 'Only HRMS managers can change how a line follows desks'; END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Give a reason'; END IF;
  PERFORM set_config('hr.wf_change_reason', btrim(p_reason), true);
  UPDATE public.hr_headcount_plans
     SET seat_capacity_id = p_seat, follow_desks = (p_seat IS NOT NULL)
   WHERE id = p_plan AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That staffing line is no longer active'; END IF;
  PERFORM set_config('hr.wf_change_reason', '', true);
END $$;