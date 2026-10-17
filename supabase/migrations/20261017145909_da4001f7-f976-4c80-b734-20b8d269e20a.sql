-- DS2: database follow-up to DS1
DO $$
DECLARE
  r record; def text; newdef text;
  edits jsonb := jsonb_build_array(
    jsonb_build_array('hr_wf_position_move_counts', $a$AND o.status = 'draft')$a$, $a$AND o.status NOT IN ('completed','cancelled'))$a$),
    jsonb_build_array('cbt_job_role_derive_from_position', 'A quiz role must be linked to a company position', 'A quiz test must be linked to a designation'),
    jsonb_build_array('cbt_job_role_derive_from_position', 'Company position "%" has no department assigned; assign a department first', 'Designation "%" has no department; set one on Organization › Designations first'),
    jsonb_build_array('cbt_job_role_derive_from_position', 'Linked company position no longer exists', 'The linked designation no longer exists'),
    jsonb_build_array('cbt_save_role_blueprint_core', 'A valid role code is required', 'A valid test code is required'),
    jsonb_build_array('cbt_save_role_blueprint_core', 'Quiz role not found', 'Quiz test not found'),
    jsonb_build_array('cbt_save_role_blueprint_core', 'Select a company position', 'Select a designation'),
    jsonb_build_array('cbt_save_role_blueprint_core', 'That role code, position, or section order is already in use', 'That test code, designation or section order is already in use'),
    jsonb_build_array('cbt_save_role_blueprint_core', 'The linked company position cannot be changed', 'The linked designation cannot be changed'),
    jsonb_build_array('hr_validate_seat_capacity_kind', 'Training-only capacity cannot be role-assigned or counted as operational work capacity', 'Training-only capacity cannot be tied to a designation or counted as operational work capacity'),
    jsonb_build_array('hr_validate_shared_position_scope', 'The primary position must be included in the shared role scope', 'The main designation must be one of the line''s designations'),
    jsonb_build_array('hr_validate_shared_position_scope', 'The shared role scope cannot contain duplicate positions', 'A line can''t list the same designation twice')
  );
  e jsonb; fn text;
BEGIN
  FOR fn IN SELECT DISTINCT x->>0 FROM jsonb_array_elements(edits) x LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=fn;
    IF def IS NULL THEN RAISE EXCEPTION 'DS2: function % not found', fn; END IF;
    newdef := def;
    FOR e IN SELECT x FROM jsonb_array_elements(edits) x WHERE x->>0 = fn LOOP
      IF position('''' || replace(e->>1,'''','''''') || '''' IN newdef) = 0 AND fn <> 'hr_wf_position_move_counts' THEN
        RAISE EXCEPTION 'DS2: message not found in %: %', fn, e->>1; END IF;
      IF fn = 'hr_wf_position_move_counts' THEN
        IF position(e->>1 IN newdef) = 0 THEN RAISE EXCEPTION 'DS2: onboarding filter not found'; END IF;
        newdef := replace(newdef, e->>1, e->>2);
      ELSE
        newdef := replace(newdef, '''' || replace(e->>1,'''','''''') || '''', '''' || replace(e->>2,'''','''''') || '''');
      END IF;
    END LOOP;
    EXECUTE newdef;
  END LOOP;
END $$;

-- 4. ERP-login sync only when something changed
CREATE OR REPLACE FUNCTION public.ds1_login_follow_employee()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_resync boolean := false; v_login boolean := false;
BEGIN
 IF NOT NEW.is_active THEN RETURN NULL; END IF;
 IF TG_OP = 'INSERT' THEN
  v_resync := true; v_login := true;
 ELSE
  IF OLD.is_active IS DISTINCT FROM true THEN v_resync := true; v_login := true; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN v_login := true; END IF;
 END IF;
 IF v_resync THEN
  UPDATE public.hr_employee_work_info SET job_position_id=job_position_id WHERE employee_id=NEW.id;
 END IF;
 IF v_login THEN
  UPDATE public.users u SET department_id=w.department_id,position_id=w.job_position_id FROM public.hr_employees e LEFT JOIN public.hr_employee_work_info w ON w.employee_id=e.id WHERE e.id=NEW.id AND u.id=NEW.user_id AND (u.department_id IS DISTINCT FROM w.department_id OR u.position_id IS DISTINCT FROM w.job_position_id);
 END IF;
 RETURN NULL;
END $function$;

-- 2. Department renames reach RACI
CREATE OR REPLACE FUNCTION public.ds2_raci_department_rename()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.raci_roles r SET department = NEW.name
      FROM public.positions p
     WHERE r.position_id = p.id AND p.department_id = NEW.id
       AND r.department IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.ds2_raci_department_rename() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ds2_raci_department_rename() TO service_role;
CREATE TRIGGER ds2_raci_department_rename AFTER UPDATE OF name ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.ds2_raci_department_rename();

-- 3. A JD's title follows its designation link
CREATE OR REPLACE FUNCTION public.ds2_jd_title_follow_designation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_title text;
BEGIN
  IF NEW.position_id IS NOT NULL THEN
    SELECT title INTO v_title FROM public.positions WHERE id = NEW.position_id;
    IF v_title IS NOT NULL THEN NEW.role_title := v_title; END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.ds2_jd_title_follow_designation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ds2_jd_title_follow_designation() TO service_role;
CREATE TRIGGER ds2_jd_title_follow_designation BEFORE INSERT OR UPDATE OF position_id ON public.hr_job_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.ds2_jd_title_follow_designation();