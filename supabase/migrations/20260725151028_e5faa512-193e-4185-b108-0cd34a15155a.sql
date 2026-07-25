
-- 1) Audit table for Sunday credit attempts
CREATE TABLE IF NOT EXISTS public.hr_sunday_credit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  attendance_date date NOT NULL,
  attendance_status text,
  outcome text NOT NULL, -- 'granted' | 'duplicate_blocked' | 'skipped_non_qualifying' | 'revoke_skipped_consumed'
  reason text,
  trigger_op text, -- 'INSERT' | 'UPDATE' | 'DELETE'
  compoff_credit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hr_sunday_credit_audit TO authenticated;
GRANT ALL ON public.hr_sunday_credit_audit TO service_role;

ALTER TABLE public.hr_sunday_credit_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR can view sunday credit audit" ON public.hr_sunday_credit_audit;
CREATE POLICY "HR can view sunday credit audit"
  ON public.hr_sunday_credit_audit FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.user_has_permission(auth.uid(), 'hrms_manage'::app_permission)
    OR public.user_has_permission(auth.uid(), 'hrms_view'::app_permission)
  );

CREATE INDEX IF NOT EXISTS idx_hr_sunday_credit_audit_emp_date
  ON public.hr_sunday_credit_audit(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_hr_sunday_credit_audit_outcome
  ON public.hr_sunday_credit_audit(outcome, created_at DESC);

-- 2) Harden hr_grant_sunday_work_credit: detect duplicates + log every attempt
CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
  v_existing_id uuid;
BEGIN
  -- Only Sundays (0 = Sunday)
  IF EXTRACT(DOW FROM NEW.attendance_date) <> 0 THEN
    RETURN NEW;
  END IF;

  -- Only for statuses that indicate the employee actually showed up
  IF NEW.status NOT IN ('present','late','half_day') THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason, trigger_op
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'skipped_non_qualifying', 'Status not in (present,late,half_day)', TG_OP
    );
    RETURN NEW;
  END IF;

  -- Idempotent insert via unique index (employee_id, credit_date, credit_type)
  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, 'sunday_work', 1, false,
    'Auto-granted: Sunday attendance (' || NEW.status || ')'
  )
  ON CONFLICT (employee_id, credit_date, credit_type) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'granted', 'New Sunday credit created', TG_OP, v_inserted_id
    );
  ELSE
    -- Duplicate — lookup existing credit id for traceability
    SELECT id INTO v_existing_id
    FROM public.hr_compoff_credits
    WHERE employee_id = NEW.employee_id
      AND credit_date = NEW.attendance_date
      AND credit_type = 'sunday_work'
    LIMIT 1;

    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'duplicate_blocked',
      'Credit already exists for this employee & Sunday — blocked by unique index',
      TG_OP, v_existing_id
    );

    RAISE NOTICE 'Sunday credit duplicate blocked for employee % on %', NEW.employee_id, NEW.attendance_date;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Prevent is_allocated flip-back on sunday_work credits without proper revoke
CREATE OR REPLACE FUNCTION public.hr_guard_sunday_credit_allocation_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.credit_type = 'sunday_work'
     AND OLD.is_allocated = true
     AND NEW.is_allocated = false THEN
    RAISE EXCEPTION 'Cannot un-allocate a sunday_work credit directly. Delete the row or revoke via attendance change.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_guard_sunday_credit_allocation_flag ON public.hr_compoff_credits;
CREATE TRIGGER trg_hr_guard_sunday_credit_allocation_flag
  BEFORE UPDATE OF is_allocated ON public.hr_compoff_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_guard_sunday_credit_allocation_flag();

-- 4) Log revoke-skipped cases (credit already consumed)
CREATE OR REPLACE FUNCTION public.hr_revoke_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit RECORD;
  v_used numeric;
BEGIN
  IF EXTRACT(DOW FROM OLD.attendance_date) <> 0 THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- On UPDATE, only act when status transitions AWAY from a qualifying status
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('present','late','half_day') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO v_credit
  FROM public.hr_compoff_credits
  WHERE employee_id = OLD.employee_id
    AND credit_date = OLD.attendance_date
    AND credit_type = 'sunday_work'
  LIMIT 1;

  IF v_credit.id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Guard: don't yank a credit the employee already spent
  IF v_credit.leave_allocation_id IS NOT NULL THEN
    SELECT used_days INTO v_used FROM public.hr_leave_allocations WHERE id = v_credit.leave_allocation_id;
    IF COALESCE(v_used,0) > 0 THEN
      INSERT INTO public.hr_sunday_credit_audit (
        employee_id, attendance_date, attendance_status, outcome, reason,
        trigger_op, compoff_credit_id
      ) VALUES (
        OLD.employee_id, OLD.attendance_date, COALESCE(NEW.status, OLD.status),
        'revoke_skipped_consumed',
        'Sunday credit already consumed (used_days=' || v_used || ') — not revoked',
        TG_OP, v_credit.id
      );
      RAISE NOTICE 'Sunday credit % already consumed (used=%); not revoked', v_credit.id, v_used;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    UPDATE public.hr_leave_allocations
       SET allocated_days = GREATEST(COALESCE(allocated_days,0) - v_credit.credit_days, 0),
           available_days = GREATEST(COALESCE(available_days,0) - v_credit.credit_days, 0),
           updated_at = now()
     WHERE id = v_credit.leave_allocation_id;
  END IF;

  DELETE FROM public.hr_compoff_credits WHERE id = v_credit.id;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
