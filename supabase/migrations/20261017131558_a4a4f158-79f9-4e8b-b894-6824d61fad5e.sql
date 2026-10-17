ALTER TABLE public.positions ALTER COLUMN hierarchy_level DROP DEFAULT;
ALTER TABLE public.positions ADD CONSTRAINT positions_company_grade_check CHECK (hierarchy_level BETWEEN 1 AND 8) NOT VALID;
ALTER TABLE public.raci_roles ADD COLUMN position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX raci_roles_position_unique ON public.raci_roles(position_id) WHERE position_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ds1_work_info_designation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; dept text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hr_employees e WHERE e.id=NEW.employee_id AND e.is_active) THEN RETURN NEW; END IF;
 IF NEW.job_position_id IS NULL THEN NEW.job_role:=NULL; NEW.level_band:=NULL; RETURN NEW; END IF;
 SELECT x.title,x.hierarchy_level,x.department_id,d.name INTO p FROM public.positions x LEFT JOIN public.departments d ON d.id=x.department_id WHERE x.id=NEW.job_position_id FOR SHARE OF x;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF p.department_id IS NOT NULL THEN
  IF TG_OP='UPDATE' AND NEW.job_position_id IS NOT DISTINCT FROM OLD.job_position_id AND NEW.department_id IS DISTINCT FROM OLD.department_id AND NEW.department_id IS DISTINCT FROM p.department_id THEN
   SELECT name INTO dept FROM public.departments WHERE id=NEW.department_id;
   RAISE EXCEPTION '% belongs to %. Choose a designation in %, or move the designation.',p.title,p.name,coalesce(dept,'the new department');
  END IF;
  NEW.department_id:=p.department_id;
 END IF;
 NEW.job_role:=p.title;
 NEW.level_band:=CASE WHEN p.hierarchy_level IS NOT NULL THEN 'L'||p.hierarchy_level END;
 RETURN NEW;
END $$;
CREATE TRIGGER a00_ds1_work_info BEFORE INSERT OR UPDATE ON public.hr_employee_work_info FOR EACH ROW EXECUTE FUNCTION public.ds1_work_info_designation();

CREATE OR REPLACE FUNCTION public.ds1_onboarding_designation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; dept text;
BEGIN
 IF NEW.status IN ('completed','cancelled') OR (TG_OP='UPDATE' AND OLD.status IN ('completed','cancelled')) THEN RETURN NEW; END IF;
 IF NEW.position_id IS NULL THEN NEW.job_role:=NULL; RETURN NEW; END IF;
 SELECT x.title,x.department_id,d.name INTO p FROM public.positions x LEFT JOIN public.departments d ON d.id=x.department_id WHERE x.id=NEW.position_id FOR SHARE OF x;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF p.department_id IS NOT NULL THEN
  IF TG_OP='UPDATE' AND NEW.position_id IS NOT DISTINCT FROM OLD.position_id AND NEW.department_id IS DISTINCT FROM OLD.department_id AND NEW.department_id IS DISTINCT FROM p.department_id THEN
   SELECT name INTO dept FROM public.departments WHERE id=NEW.department_id;
   RAISE EXCEPTION '% belongs to %. Choose a designation in %, or move the designation.',p.title,p.name,coalesce(dept,'the new department');
  END IF;
  NEW.department_id:=p.department_id;
 END IF;
 NEW.job_role:=p.title;
 RETURN NEW;
END $$;
CREATE TRIGGER a00_ds1_onboarding BEFORE INSERT OR UPDATE ON public.hr_employee_onboarding FOR EACH ROW EXECUTE FUNCTION public.ds1_onboarding_designation();

CREATE OR REPLACE FUNCTION public.ds1_users_from_hr() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w record;
BEGIN
 SELECT wi.department_id,wi.job_position_id INTO w FROM public.hr_employees e LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id=e.id WHERE e.user_id=NEW.id AND e.is_active ORDER BY e.id LIMIT 1;
 IF FOUND THEN NEW.department_id:=w.department_id; NEW.position_id:=w.job_position_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a00_ds1_users_from_hr BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.ds1_users_from_hr();

CREATE OR REPLACE FUNCTION public.ds1_login_follow_work_info() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.users u SET department_id=NEW.department_id,position_id=NEW.job_position_id FROM public.hr_employees e WHERE e.id=NEW.employee_id AND e.is_active AND u.id=e.user_id AND (u.department_id IS DISTINCT FROM NEW.department_id OR u.position_id IS DISTINCT FROM NEW.job_position_id);
 RETURN NULL;
END $$;
CREATE TRIGGER ds1_login_follow_work_info AFTER INSERT OR UPDATE ON public.hr_employee_work_info FOR EACH ROW EXECUTE FUNCTION public.ds1_login_follow_work_info();

CREATE OR REPLACE FUNCTION public.ds1_login_follow_employee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_active THEN
  UPDATE public.hr_employee_work_info SET job_position_id=job_position_id WHERE employee_id=NEW.id;
  UPDATE public.users u SET department_id=w.department_id,position_id=w.job_position_id FROM public.hr_employee_work_info w WHERE w.employee_id=NEW.id AND u.id=NEW.user_id AND (u.department_id IS DISTINCT FROM w.department_id OR u.position_id IS DISTINCT FROM w.job_position_id);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER ds1_login_follow_employee AFTER INSERT OR UPDATE OF user_id,is_active ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.ds1_login_follow_employee();

CREATE OR REPLACE FUNCTION public.ds1_raci_designation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record;
BEGIN
 IF NEW.position_id IS NOT NULL THEN
  SELECT x.title,d.name INTO p FROM public.positions x LEFT JOIN public.departments d ON d.id=x.department_id WHERE x.id=NEW.position_id;
  IF FOUND THEN NEW.name:=p.title; NEW.department:=p.name; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ds1_raci_designation BEFORE INSERT OR UPDATE ON public.raci_roles FOR EACH ROW EXECUTE FUNCTION public.ds1_raci_designation();

CREATE OR REPLACE FUNCTION public.hr_wf_position_rename() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.title IS DISTINCT FROM OLD.title OR NEW.hierarchy_level IS DISTINCT FROM OLD.hierarchy_level THEN
  UPDATE public.hr_employee_work_info w SET job_role=NEW.title,level_band=CASE WHEN NEW.hierarchy_level IS NOT NULL THEN 'L'||NEW.hierarchy_level END FROM public.hr_employees e WHERE e.id=w.employee_id AND e.is_active AND w.job_position_id=NEW.id AND (w.job_role IS DISTINCT FROM NEW.title OR w.level_band IS DISTINCT FROM CASE WHEN NEW.hierarchy_level IS NOT NULL THEN 'L'||NEW.hierarchy_level END);
 END IF;
 IF NEW.title IS DISTINCT FROM OLD.title OR NEW.department_id IS DISTINCT FROM OLD.department_id THEN
  UPDATE public.hr_employee_onboarding SET job_role=NEW.title,department_id=coalesce(NEW.department_id,department_id) WHERE position_id=NEW.id AND status NOT IN ('completed','cancelled') AND (job_role IS DISTINCT FROM NEW.title OR (NEW.department_id IS NOT NULL AND department_id IS DISTINCT FROM NEW.department_id));
  UPDATE public.hr_job_descriptions SET role_title=NEW.title WHERE position_id=NEW.id AND role_title IS DISTINCT FROM NEW.title;
  UPDATE public.raci_roles SET name=NEW.title,department=(SELECT name FROM public.departments WHERE id=NEW.department_id) WHERE position_id=NEW.id;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER trg_hr_wf_position_rename ON public.positions;
CREATE TRIGGER trg_hr_wf_position_rename AFTER UPDATE OF title,hierarchy_level,department_id ON public.positions FOR EACH ROW EXECUTE FUNCTION public.hr_wf_position_rename();

CREATE OR REPLACE FUNCTION public.ds1_designation_reporting_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bad boolean; title_b text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ds1_designation_reporting'));
 IF NEW.reports_to_position_id IS NULL THEN RETURN NEW; END IF;
 WITH RECURSIVE chain(id,parent,path) AS (
 SELECT p.id,p.reports_to_position_id,ARRAY[p.id] FROM public.positions p WHERE p.id=NEW.reports_to_position_id
 UNION ALL SELECT p.id,p.reports_to_position_id,c.path||p.id FROM public.positions p JOIN chain c ON p.id=c.parent WHERE NOT p.id=ANY(c.path)
 ) SELECT EXISTS(SELECT 1 FROM chain WHERE id=NEW.id) INTO bad;
 IF NEW.reports_to_position_id=NEW.id OR bad THEN
  SELECT title INTO title_b FROM public.positions WHERE id=NEW.reports_to_position_id;
  RAISE EXCEPTION '% can''t report to % — % already reports to %.',NEW.title,coalesce(title_b,NEW.title),coalesce(title_b,NEW.title),NEW.title;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a00_ds1_reporting_guard BEFORE INSERT OR UPDATE OF reports_to_position_id ON public.positions FOR EACH ROW EXECUTE FUNCTION public.ds1_designation_reporting_guard();

CREATE OR REPLACE VIEW public.hr_employee_completeness WITH (security_invoker=true) AS
 SELECT e.id AS employee_id,
 EXISTS(SELECT 1 FROM public.hr_employee_bank_details b WHERE b.employee_id=e.id AND b.account_number IS NOT NULL AND b.account_number<>'') AS has_bank,
 EXISTS(SELECT 1 FROM public.hr_employee_salary_structures s WHERE s.employee_id=e.id) OR coalesce(o.ctc,0)>0 AS has_salary,
 EXISTS(SELECT 1 FROM public.hr_employee_work_info w WHERE w.employee_id=e.id AND w.joining_date IS NOT NULL) OR o.date_of_joining IS NOT NULL AS has_doj,
 EXISTS(SELECT 1 FROM public.hr_employee_work_info w WHERE w.employee_id=e.id AND w.job_position_id IS NOT NULL) OR o.position_id IS NOT NULL AS has_designation
 FROM public.hr_employees e JOIN public.hr_employee_onboarding o ON o.employee_id=e.id WHERE coalesce(o.status,'') NOT IN ('completed','cancelled');

-- Replace only user-facing SQL literals; identifiers, HINT and ERRCODE remain byte-identical.
DO $ds1$ DECLARE r record; src text; m text[]; lit text; BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY['ats_validate_job_requirement_core','hr_wf_link_requirement_line','hr_wf_onboarding_requirement_guard','hr_wf_position_guard','hr_wf_position_move_preview','hr_wf_set_no_staff_needed','hr_wf_validate_line_overlap','hr_wf_position_lines_follow','hr_wf_position_move_apply','hr_wf_position_move_refusal','hr_wf_assert_role_planned','hr_wf_position_delete_guard','hr_wf_department_guard']) LOOP
  src:=pg_get_functiondef(r.oid);
  FOR m IN SELECT regexp_matches(src,$re$'((?:[^']|'')*)'$re$,'g') LOOP
   lit:=m[1];
   IF lit ~ '\m(position|Position|role|Role)\M' THEN
    src:=replace(src,quote_literal(lit),quote_literal(regexp_replace(lit,'\m(position|role)\M','designation','g')));
    src:=replace(src,quote_literal(lit),quote_literal(regexp_replace(lit,'\m(Position|Role)\M','Designation','g')));
   END IF;
  END LOOP;
  -- WF7 moves must finish all non-historical onboarding rows, not only drafts.
  IF r.oid::regproc::text='hr_wf_position_move_apply' THEN src:=replace(src,'o.status = ''draft''','o.status NOT IN (''completed'',''cancelled'')'); END IF;
  EXECUTE src;
 END LOOP;
END $ds1$;
REVOKE ALL ON FUNCTION public.ds1_work_info_designation(),public.ds1_onboarding_designation(),public.ds1_users_from_hr(),public.ds1_login_follow_work_info(),public.ds1_login_follow_employee(),public.ds1_raci_designation(),public.ds1_designation_reporting_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ds1_work_info_designation(),public.ds1_onboarding_designation(),public.ds1_users_from_hr(),public.ds1_login_follow_work_info(),public.ds1_login_follow_employee(),public.ds1_raci_designation(),public.ds1_designation_reporting_guard() TO service_role;