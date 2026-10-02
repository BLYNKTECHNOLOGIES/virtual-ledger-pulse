CREATE OR REPLACE FUNCTION public.promote_scheduled_salary_revision(p_row_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.hr_salary_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.hr_salary_revisions WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_row_id; END IF;
  IF v_row.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('status', v_row.status, 'id', v_row.id, 'noop', true);
  END IF;
  -- Tell the change-log trigger this change is already recorded (prevents duplicate 'correction' rows).
  PERFORM set_config('app.revision_source_id', v_row.id::text, true);
  PERFORM set_config('app.promoting_revision_id', v_row.id::text, true);

  UPDATE public.hr_employees
     SET basic_salary = COALESCE(v_row.new_basic, basic_salary),
         total_salary = v_row.new_total,
         updated_at   = now()
   WHERE id = v_row.employee_id;

  PERFORM public._rescale_employee_salary_structure(v_row.employee_id, v_row.new_total);

  UPDATE public.hr_salary_revisions
     SET status = 'APPLIED', approved_by = COALESCE(approved_by, 'system:scheduled-promotion'), updated_at = now()
   WHERE id = v_row.id;
  PERFORM set_config('app.revision_source_id', '', true);

  RETURN jsonb_build_object('status','APPLIED','id',v_row.id,'employee_id',v_row.employee_id,'new_total',v_row.new_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_salary_revision_on_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_revision_type TEXT; v_reason TEXT; v_approved_by TEXT; v_effective_from DATE; v_source_id UUID;
BEGIN
  IF (OLD.basic_salary IS DISTINCT FROM NEW.basic_salary) OR (OLD.total_salary IS DISTINCT FROM NEW.total_salary) THEN
    v_source_id := NULLIF(current_setting('app.revision_source_id', true), '')::uuid;
    IF v_source_id IS NOT NULL THEN RETURN NEW; END IF;

    v_revision_type  := COALESCE(NULLIF(current_setting('app.revision_type', true), ''), 'correction');
    v_reason         := NULLIF(current_setting('app.revision_reason', true), '');
    -- Always record who/what changed the salary: the signed-in user, else the automated source.
    v_approved_by    := COALESCE(NULLIF(current_setting('app.revision_approved_by', true), ''),
                                 auth.uid()::text,
                                 'system:' || COALESCE(NULLIF(current_setting('application_name', true), ''), 'automated'));
    v_effective_from := COALESCE(NULLIF(current_setting('app.revision_effective_from', true), '')::date, CURRENT_DATE);

    INSERT INTO hr_salary_revisions (employee_id, previous_basic, new_basic, previous_total, new_total,
      revision_type, revision_reason, approved_by, effective_from, status)
    VALUES (NEW.id, OLD.basic_salary, NEW.basic_salary, OLD.total_salary, NEW.total_salary,
      v_revision_type, v_reason, v_approved_by, v_effective_from, 'APPLIED');
  END IF;
  RETURN NEW;
END;
$function$;