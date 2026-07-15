
-- 1. Add status column & revision type check
ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'APPLIED';

DO $$ BEGIN
  ALTER TABLE public.hr_salary_revisions
    ADD CONSTRAINT hr_salary_revisions_status_check
    CHECK (status IN ('SCHEDULED','APPLIED','CANCELLED','NOOP'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.hr_salary_revisions
    ADD CONSTRAINT hr_salary_revisions_type_check
    CHECK (revision_type IN ('increment','promotion','correction','demotion'));
EXCEPTION WHEN duplicate_object THEN NULL;
     WHEN check_violation THEN
       UPDATE public.hr_salary_revisions
         SET revision_type = 'correction'
         WHERE revision_type NOT IN ('increment','promotion','correction','demotion');
       ALTER TABLE public.hr_salary_revisions
         ADD CONSTRAINT hr_salary_revisions_type_check
         CHECK (revision_type IN ('increment','promotion','correction','demotion'));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_salary_revisions_scheduled
  ON public.hr_salary_revisions(employee_id, effective_from)
  WHERE status = 'SCHEDULED';

-- 2. Mark historical no-op rows
UPDATE public.hr_salary_revisions
   SET status = 'NOOP'
 WHERE status = 'APPLIED'
   AND COALESCE(previous_basic,0) = COALESCE(new_basic,0)
   AND COALESCE(previous_total,0) = COALESCE(new_total,0);

-- 3. Extend trigger to read session vars for reason / approver / effective date
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
BEGIN
  IF (OLD.basic_salary IS DISTINCT FROM NEW.basic_salary)
     OR (OLD.total_salary IS DISTINCT FROM NEW.total_salary) THEN
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

-- 4. Main RPC — apply or schedule a salary revision
CREATE OR REPLACE FUNCTION public.apply_salary_revision(
  p_employee_id uuid,
  p_new_basic numeric,
  p_new_total numeric,
  p_revision_type text,
  p_reason text,
  p_effective_from date,
  p_approved_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_prev_basic numeric;
  v_prev_total numeric;
  v_row_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.user_has_permission(v_uid, 'hrms_manage'::app_permission)
      OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                 WHERE ur.user_id = v_uid AND lower(r.name) = 'super admin')
    INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Permission denied: HRMS manage required';
  END IF;

  IF p_revision_type NOT IN ('increment','promotion','correction','demotion') THEN
    RAISE EXCEPTION 'Invalid revision type: %', p_revision_type;
  END IF;

  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION 'New total salary must be a non-negative number';
  END IF;

  SELECT basic_salary, total_salary INTO v_prev_basic, v_prev_total
    FROM public.hr_employees WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF COALESCE(v_prev_basic,0) = COALESCE(p_new_basic,0)
     AND COALESCE(v_prev_total,0) = COALESCE(p_new_total,0) THEN
    RAISE EXCEPTION 'No change: new amounts match current salary';
  END IF;

  -- Scheduled path
  IF p_effective_from > CURRENT_DATE THEN
    INSERT INTO public.hr_salary_revisions(
      employee_id, previous_basic, new_basic, previous_total, new_total,
      revision_type, revision_reason, approved_by, effective_from, status
    ) VALUES (
      p_employee_id, v_prev_basic, p_new_basic, v_prev_total, p_new_total,
      p_revision_type, p_reason, p_approved_by, p_effective_from, 'SCHEDULED'
    )
    RETURNING id INTO v_row_id;

    RETURN jsonb_build_object('status','SCHEDULED','id',v_row_id,'effective_from',p_effective_from);
  END IF;

  -- Immediate path: seed session vars for the trigger, then update employee
  PERFORM set_config('app.revision_type', p_revision_type, true);
  PERFORM set_config('app.revision_reason', COALESCE(p_reason,''), true);
  PERFORM set_config('app.revision_approved_by', COALESCE(p_approved_by,''), true);
  PERFORM set_config('app.revision_effective_from', COALESCE(p_effective_from, CURRENT_DATE)::text, true);

  UPDATE public.hr_employees
     SET basic_salary = p_new_basic,
         total_salary = p_new_total,
         updated_at = now()
   WHERE id = p_employee_id;

  SELECT id INTO v_row_id FROM public.hr_salary_revisions
   WHERE employee_id = p_employee_id
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object('status','APPLIED','id',v_row_id,'effective_from',COALESCE(p_effective_from,CURRENT_DATE));
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_salary_revision(uuid,numeric,numeric,text,text,date,text) TO authenticated;

-- 5. Cancel scheduled revision
CREATE OR REPLACE FUNCTION public.cancel_scheduled_salary_revision(p_revision_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
BEGIN
  SELECT public.user_has_permission(v_uid, 'hrms_manage'::app_permission)
      OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                 WHERE ur.user_id = v_uid AND lower(r.name) = 'super admin')
    INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.hr_salary_revisions
     SET status = 'CANCELLED',
         revision_reason = COALESCE(revision_reason, '') || CASE WHEN p_reason IS NOT NULL THEN ' [Cancelled: ' || p_reason || ']' ELSE ' [Cancelled]' END
   WHERE id = p_revision_id AND status = 'SCHEDULED';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_scheduled_salary_revision(uuid,text) TO authenticated;

-- 6. Daily promoter for scheduled revisions
CREATE OR REPLACE FUNCTION public.apply_due_scheduled_salary_revisions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.hr_salary_revisions
     WHERE status = 'SCHEDULED' AND effective_from <= CURRENT_DATE
     ORDER BY effective_from ASC, created_at ASC
  LOOP
    PERFORM set_config('app.revision_type', r.revision_type, true);
    PERFORM set_config('app.revision_reason', COALESCE(r.revision_reason,''), true);
    PERFORM set_config('app.revision_approved_by', COALESCE(r.approved_by,''), true);
    PERFORM set_config('app.revision_effective_from', r.effective_from::text, true);

    UPDATE public.hr_employees
       SET basic_salary = r.new_basic,
           total_salary = r.new_total,
           updated_at = now()
     WHERE id = r.employee_id;

    UPDATE public.hr_salary_revisions
       SET status = 'APPLIED'
     WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_due_scheduled_salary_revisions() TO authenticated, service_role;

-- 7. RLS: allow authenticated read (already has), block direct writes (only via RPCs above run as SECURITY DEFINER)
DO $$ BEGIN
  DROP POLICY IF EXISTS "hr_salary_revisions_read" ON public.hr_salary_revisions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE POLICY "hr_salary_revisions_read"
  ON public.hr_salary_revisions FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.hr_salary_revisions TO authenticated;
GRANT ALL ON public.hr_salary_revisions TO service_role;
