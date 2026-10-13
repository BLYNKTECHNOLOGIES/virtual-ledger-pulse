CREATE OR REPLACE FUNCTION public.hr_ats_hire_handoff()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_actor text := public.ats_actor_name(auth.uid());
  c public.ats_candidates%ROWTYPE; j public.ats_jobs%ROWTYPE; rq public.hr_hiring_requirements%ROWTYPE; o public.hr_employee_onboarding%ROWTYPE;
  v_first text; v_last text; v_shift uuid; v_type text; v_id uuid; v_sids uuid[];
BEGIN
  IF NEW.status = 'hired' AND OLD.status IS DISTINCT FROM 'hired' THEN
    SELECT * INTO o FROM public.hr_employee_onboarding WHERE ats_application_id = NEW.id ORDER BY (status = 'cancelled'), created_at LIMIT 1;
    IF FOUND THEN
      IF o.status = 'cancelled' THEN
        UPDATE public.hr_employee_onboarding SET status = 'draft', updated_at = now() WHERE id = o.id;
        INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
        VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding draft restored',
                jsonb_build_object('onboarding_id', o.id), v_uid, v_actor);
      END IF;
      RETURN NULL;
    END IF;
    SELECT * INTO c FROM public.ats_candidates WHERE id = NEW.candidate_id;
    SELECT * INTO j FROM public.ats_jobs WHERE id = NEW.job_id;
    IF j.requisition_id IS NOT NULL THEN SELECT * INTO rq FROM public.hr_hiring_requirements WHERE id = j.requisition_id; END IF;
    v_first := split_part(btrim(coalesce(c.full_name,'')), ' ', 1);
    v_last := btrim(substr(btrim(coalesce(c.full_name,'')), length(v_first) + 1));
    v_shift := rq.shift_id;
    IF v_shift IS NULL AND cardinality(coalesce(NEW.preferred_shifts, '{}')) = 1 THEN
      SELECT s.id INTO v_shift FROM public.hr_shifts s
       WHERE s.id::text = NEW.preferred_shifts[1] OR lower(s.name) = lower(btrim(NEW.preferred_shifts[1])) LIMIT 1;
    END IF;
    v_sids := coalesce(j.shift_ids, '{}');
    IF v_shift IS NULL AND cardinality(v_sids) = 1 THEN v_shift := v_sids[1]; END IF;
    v_type := CASE lower(coalesce(j.employment_type, rq.employment_type, ''))
      WHEN 'contract' THEN 'contract' WHEN 'intern' THEN 'intern' WHEN 'internship' THEN 'intern' ELSE 'full_time' END;
    INSERT INTO public.hr_employee_onboarding (status, current_stage, first_name, last_name, email, phone,
      department_id, position_id, shift_id, employee_type, created_by, ats_application_id)
    VALUES ('draft', 1, nullif(v_first,''), coalesce(v_last,''), c.email, c.phone,
      coalesce(j.department_id, rq.department_id), coalesce(j.position_id, rq.position_id), v_shift, v_type, v_uid, NEW.id)
    RETURNING id INTO v_id;
    INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
    VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding draft created',
            jsonb_build_object('onboarding_id', v_id), v_uid, v_actor);
  ELSIF OLD.status = 'hired' AND NEW.status IS DISTINCT FROM 'hired' THEN
    SELECT * INTO o FROM public.hr_employee_onboarding WHERE ats_application_id = NEW.id AND status <> 'cancelled' LIMIT 1;
    IF FOUND THEN
      IF o.status = 'draft' AND coalesce(o.current_stage,1) <= 1 AND o.employee_id IS NULL
         AND coalesce(o.documents, '[]'::jsonb) IN ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb) THEN
        UPDATE public.hr_employee_onboarding SET status = 'cancelled', updated_at = now() WHERE id = o.id;
        INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
        VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Hire undone — onboarding draft cancelled',
                jsonb_build_object('onboarding_id', o.id), v_uid, v_actor);
      ELSE
        INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
        VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'onboarding_draft', 'Onboarding is already in progress — review it',
                jsonb_build_object('onboarding_id', o.id, 'onboarding_status', o.status), v_uid, v_actor);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $function$;