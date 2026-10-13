-- 1
REVOKE EXECUTE ON FUNCTION public.hr_send_requirement_to_recruitment(uuid) FROM PUBLIC, anon, authenticated;

-- 5: no-argument check for the signed-in user
CREATE OR REPLACE FUNCTION public.hr_wf_is_current_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.hr_wf_is_manager(auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION public.hr_wf_is_current_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_is_current_manager() TO authenticated, service_role;

DO $$
DECLARE p record; q text; c text;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
           WHERE coalesce(qual,'')||coalesce(with_check,'') LIKE '%hr_wf_is_manager(auth.uid())%' LOOP
    q := replace(p.qual, 'hr_wf_is_manager(auth.uid())', 'hr_wf_is_current_manager()');
    c := replace(p.with_check, 'hr_wf_is_manager(auth.uid())', 'hr_wf_is_current_manager()');
    EXECUTE format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename)
      || CASE WHEN q IS NOT NULL THEN ' USING ('||q||')' ELSE '' END
      || CASE WHEN c IS NOT NULL THEN ' WITH CHECK ('||c||')' ELSE '' END;
  END LOOP;
END $$;

-- 2: drafts only
ALTER POLICY wf_mgr_delete ON public.hr_hiring_requirements
  USING (public.hr_wf_is_current_manager() AND status = 'draft');

CREATE OR REPLACE FUNCTION public.hr_wf_remove_desk_group(p_seat uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.hr_wf_is_current_manager() THEN RAISE EXCEPTION 'Only HRMS managers can remove a desk group'; END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for removing this desk group'; END IF;
  UPDATE public.hr_seat_capacity
     SET is_active = false, notes = concat_ws(E'\n', nullif(notes, ''), 'Removed: ' || btrim(p_reason))
   WHERE id = p_seat AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That desk group is no longer active'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_wf_audit_requirement_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft requirements can be deleted — cancel it instead';
  END IF;
  INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
  VALUES ('hiring_requirement', OLD.id, 'Requirement deleted', concat_ws(' · ', OLD.requirement_no, OLD.status, OLD.number_required::text), NULL,
          nullif(current_setting('hr.wf_change_reason', true), ''), auth.uid());
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_wf_audit_requirement_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_hiring_req_audit_delete ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_hiring_req_audit_delete BEFORE DELETE ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_audit_requirement_delete();

-- 3
CREATE OR REPLACE FUNCTION public.hr_wf_leaving_soon_core()
 RETURNS TABLE(employee_id uuid, department_id uuid, position_id uuid, plan_id uuid, last_working_day date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.employee_id, p.department_id, p.position_id,
    (SELECT b.plan_id FROM public.hr_wf_line_base() b WHERE b.department_id IS NOT DISTINCT FROM p.department_id
       AND p.position_id = ANY(b.roles) AND (cardinality(b.groups) = 0 OR p.group_id = ANY(b.groups))
     ORDER BY cardinality(b.groups) DESC LIMIT 1),
    coalesce(e.last_working_day, e.notice_period_end_date)
  FROM public.hr_wf_people() p JOIN public.hr_employees e ON e.id = p.employee_id
  WHERE p.resignation_status = 'notice_period' AND p.position_id IS NOT NULL
$function$;
REVOKE EXECUTE ON FUNCTION public.hr_wf_leaving_soon_core() FROM PUBLIC, anon, authenticated;

-- 4: server-set "Raised by" for browser (manual) inserts
CREATE OR REPLACE FUNCTION public.hr_wf_assign_requirement_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_name text;
BEGIN
  IF NEW.requirement_no IS NULL OR btrim(NEW.requirement_no) = '' THEN
    NEW.requirement_no := public.hr_next_hiring_requirement_no();
  END IF;
  IF NEW.source = 'manual' AND auth.uid() IS NOT NULL AND NEW.requested_by = auth.uid() THEN
    SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), nullif(u.username, ''))
      INTO v_name FROM public.users u WHERE u.id = auth.uid();
    IF v_name IS NULL THEN SELECT a.email INTO v_name FROM auth.users a WHERE a.id = auth.uid(); END IF;
    NEW.requested_by_name := v_name;
  END IF;
  RETURN NEW;
END $function$;