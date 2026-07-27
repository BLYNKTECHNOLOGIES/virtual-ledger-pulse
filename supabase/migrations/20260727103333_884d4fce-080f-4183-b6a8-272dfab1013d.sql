
-- Extend Sunday-work credit to honor per-employee weekly-off pattern
CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
  v_off_dows integer[];
  v_dow integer;
BEGIN
  v_dow := EXTRACT(DOW FROM NEW.attendance_date)::int;
  v_off_dows := public.fn_employee_weekly_off_dows(NEW.employee_id, NEW.attendance_date);

  -- Only credit when the worked day falls within the employee's weekly-off pattern
  IF v_off_dows IS NULL OR NOT (v_dow = ANY (v_off_dows)) THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('present','late','half_day') THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason, trigger_op
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'skipped_non_qualifying', 'Status not in (present,late,half_day)', TG_OP
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, 'sunday_work', 1, false,
    'Auto-granted: worked on weekly-off day (' || to_char(NEW.attendance_date,'Dy') || ', ' || NEW.status || ')'
  )
  ON CONFLICT (employee_id, credit_date) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'granted', 'Weekly-off day worked; comp-off credited', TG_OP, v_inserted_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Keep revoke aligned: only revoke if attendance is on a weekly-off day for that employee
CREATE OR REPLACE FUNCTION public.hr_revoke_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_off_dows integer[];
  v_dow integer;
BEGIN
  v_dow := EXTRACT(DOW FROM COALESCE(OLD.attendance_date, NEW.attendance_date))::int;
  v_off_dows := public.fn_employee_weekly_off_dows(
    COALESCE(OLD.employee_id, NEW.employee_id),
    COALESCE(OLD.attendance_date, NEW.attendance_date)
  );

  IF v_off_dows IS NULL OR NOT (v_dow = ANY (v_off_dows)) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Delegate to existing revoke behavior by deleting the auto-granted credit
  -- if the status no longer qualifies (or the row was deleted).
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status NOT IN ('present','late','half_day')) THEN
    DELETE FROM public.hr_compoff_credits
    WHERE employee_id = COALESCE(OLD.employee_id, NEW.employee_id)
      AND credit_date = COALESCE(OLD.attendance_date, NEW.attendance_date)
      AND credit_type = 'sunday_work'
      AND is_allocated = false;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
