
CREATE OR REPLACE FUNCTION public.fn_salary_revision_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_revision_type TEXT;
  v_reason TEXT;
  v_approved_by TEXT;
  v_effective_from DATE;
  v_source_id UUID;
BEGIN
  IF (OLD.basic_salary IS DISTINCT FROM NEW.basic_salary)
     OR (OLD.total_salary IS DISTINCT FROM NEW.total_salary) THEN
    v_source_id := NULLIF(current_setting('app.revision_source_id', true), '')::uuid;

    -- If a scheduled row is being promoted, don't insert a duplicate — the caller
    -- (promote_scheduled_salary_revision) already flips its status to APPLIED.
    IF v_source_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_revision_type   := COALESCE(NULLIF(current_setting('app.revision_type', true), ''), 'correction');
    v_reason          := NULLIF(current_setting('app.revision_reason', true), '');
    v_approved_by     := NULLIF(current_setting('app.revision_approved_by', true), '');
    v_effective_from  := COALESCE(NULLIF(current_setting('app.revision_effective_from', true), '')::date, CURRENT_DATE);

    INSERT INTO hr_salary_revisions (
      employee_id, previous_basic, new_basic, previous_total, new_total,
      revision_type, revision_reason, approved_by, effective_from, status
    ) VALUES (
      NEW.id, OLD.basic_salary, NEW.basic_salary, OLD.total_salary, NEW.total_salary,
      v_revision_type, v_reason, v_approved_by, v_effective_from, 'APPLIED'
    );
  END IF;
  RETURN NEW;
END;
$function$;
