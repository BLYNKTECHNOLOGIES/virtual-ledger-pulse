CREATE OR REPLACE FUNCTION public.hr_sync_compoff_allocation(p_employee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_year integer := extract(year from v_month_start)::integer;
  v_quarter integer := ceil(extract(month from v_month_start) / 3.0)::integer;
  v_type_id uuid;
  v_allocated numeric := 0;
  v_used numeric := 0;
  v_allocation_id uuid;
BEGIN
  SELECT id INTO v_type_id
  FROM public.hr_leave_types
  WHERE code = 'CO' AND is_active = true
  LIMIT 1;

  IF v_type_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(c.credit_days), 0)
  INTO v_allocated
  FROM public.hr_compoff_credits c
  WHERE c.employee_id = p_employee_id
    AND c.settled_period_month IS NULL
    AND c.credit_date >= v_month_start
    AND c.credit_date < (v_month_start + interval '1 month')::date;

  SELECT COALESCE(sum(rc.days), 0)
  INTO v_used
  FROM public.hr_leave_request_consumption rc
  JOIN public.hr_leave_requests r ON r.id = rc.request_id
  WHERE rc.employee_id = p_employee_id
    AND rc.leave_type_id = v_type_id
    AND lower(r.status) = 'approved'
    AND r.start_date < (v_month_start + interval '1 month')::date
    AND r.end_date >= v_month_start;

  v_used := LEAST(v_used, v_allocated);

  INSERT INTO public.hr_leave_allocations (
    employee_id, leave_type_id, year, quarter,
    allocated_days, used_days, carry_forward_days, available_days
  ) VALUES (
    p_employee_id, v_type_id, v_year, v_quarter,
    v_allocated, v_used, 0, GREATEST(v_allocated - v_used, 0)
  )
  ON CONFLICT (employee_id, leave_type_id, year, quarter)
  DO UPDATE SET
    allocated_days = EXCLUDED.allocated_days,
    used_days = EXCLUDED.used_days,
    carry_forward_days = 0,
    available_days = EXCLUDED.available_days,
    reset_date = (v_month_start + interval '1 month')::date,
    expired_date = NULL,
    updated_at = now()
  RETURNING id INTO v_allocation_id;

  UPDATE public.hr_compoff_credits
  SET is_allocated = true,
      allocated_at = COALESCE(allocated_at, now()),
      leave_allocation_id = v_allocation_id,
      expires_at = (date_trunc('month', credit_date) + interval '1 month - 1 day')::date
  WHERE employee_id = p_employee_id
    AND settled_period_month IS NULL
    AND credit_date >= v_month_start
    AND credit_date < (v_month_start + interval '1 month')::date
    AND (leave_allocation_id IS DISTINCT FROM v_allocation_id
      OR is_allocated IS DISTINCT FROM true
      OR expires_at IS DISTINCT FROM (date_trunc('month', credit_date) + interval '1 month - 1 day')::date);

  RETURN v_allocation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_sync_compoff_allocation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_sync_compoff_allocation(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_allocate_compoff_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_allocated := true;
  NEW.allocated_at := COALESCE(NEW.allocated_at, now());
  NEW.expires_at := (date_trunc('month', NEW.credit_date) + interval '1 month - 1 day')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_apply_sunday_work_credit ON public.hr_compoff_credits;
DROP TRIGGER IF EXISTS trg_compoff_sync_allocation_insert ON public.hr_compoff_credits;
DROP TRIGGER IF EXISTS trg_compoff_sync_allocation_delete ON public.hr_compoff_credits;

CREATE OR REPLACE FUNCTION public.hr_sync_compoff_allocation_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.hr_sync_compoff_allocation(COALESCE(NEW.employee_id, OLD.employee_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_compoff_sync_allocation_insert
AFTER INSERT ON public.hr_compoff_credits
FOR EACH ROW EXECUTE FUNCTION public.hr_sync_compoff_allocation_trigger();

CREATE TRIGGER trg_compoff_sync_allocation_delete
AFTER DELETE ON public.hr_compoff_credits
FOR EACH ROW EXECUTE FUNCTION public.hr_sync_compoff_allocation_trigger();

CREATE OR REPLACE FUNCTION public.hr_guard_compoff_allocation_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_month_start date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_current_year integer := extract(year from v_month_start)::integer;
  v_current_quarter integer := ceil(extract(month from v_month_start) / 3.0)::integer;
  v_expected numeric := 0;
BEGIN
  SELECT code INTO v_code FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_code IS DISTINCT FROM 'CO' THEN
    RETURN NEW;
  END IF;

  IF NEW.year = v_current_year AND NEW.quarter = v_current_quarter THEN
    SELECT COALESCE(sum(c.credit_days), 0)
    INTO v_expected
    FROM public.hr_compoff_credits c
    WHERE c.employee_id = NEW.employee_id
      AND c.settled_period_month IS NULL
      AND c.credit_date >= v_month_start
      AND c.credit_date < (v_month_start + interval '1 month')::date;
  END IF;

  IF COALESCE(NEW.allocated_days, 0) IS DISTINCT FROM v_expected
     OR COALESCE(NEW.carry_forward_days, 0) <> 0 THEN
    RAISE EXCEPTION 'Compensatory Off is ledger-managed and cannot be allocated manually';
  END IF;

  NEW.available_days := GREATEST(v_expected - COALESCE(NEW.used_days, 0), 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_compoff_allocation_amount ON public.hr_leave_allocations;
CREATE TRIGGER trg_guard_compoff_allocation_amount
BEFORE INSERT OR UPDATE OF leave_type_id, employee_id, year, quarter, allocated_days, used_days, carry_forward_days, available_days
ON public.hr_leave_allocations
FOR EACH ROW EXECUTE FUNCTION public.hr_guard_compoff_allocation_amount();

CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id uuid;
  v_off_dows integer[];
  v_dow integer;
  v_is_weekly_off boolean := false;
  v_is_holiday boolean := false;
  v_credit_type text;
  v_reason text;
BEGIN
  IF NEW.status NOT IN ('present', 'late', 'half_day') THEN
    RETURN NEW;
  END IF;

  v_dow := extract(dow from NEW.attendance_date)::integer;
  v_off_dows := public.fn_employee_weekly_off_dows(NEW.employee_id, NEW.attendance_date);
  v_is_weekly_off := v_off_dows IS NOT NULL AND v_dow = ANY(v_off_dows);

  SELECT EXISTS (
    SELECT 1 FROM public.hr_holidays h
    WHERE h.date = NEW.attendance_date AND h.is_active = true
  ) INTO v_is_holiday;

  IF NOT v_is_weekly_off AND NOT v_is_holiday THEN
    RETURN NEW;
  END IF;

  v_credit_type := CASE WHEN v_is_holiday THEN 'holiday' ELSE 'sunday_work' END;
  v_reason := CASE
    WHEN v_is_holiday AND v_is_weekly_off THEN 'Auto-granted: worked on company holiday and weekly-off day'
    WHEN v_is_holiday THEN 'Auto-granted: worked on company holiday'
    ELSE 'Auto-granted: worked on weekly-off day (' || to_char(NEW.attendance_date, 'Dy') || ', ' || NEW.status || ')'
  END;

  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, v_credit_type, 1, false, v_reason
  )
  ON CONFLICT (employee_id, credit_date) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'granted', v_reason, TG_OP, v_inserted_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_compoff_close_month(p_period_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_count integer;
  v_co_type uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.hr_is_hr_staff(auth.uid())
     AND NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT id INTO v_co_type FROM public.hr_leave_types WHERE code = 'CO' AND is_active LIMIT 1;

  UPDATE public.hr_compoff_credits c
  SET settled_period_month = v_start,
      settlement_outcome = COALESCE(c.settlement_outcome, 'settled_in_payroll')
  WHERE c.settled_period_month IS NULL
    AND c.credit_date BETWEEN v_start AND v_end;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_co_type IS NOT NULL THEN
    UPDATE public.hr_leave_allocations
    SET allocated_days = 0,
        used_days = 0,
        carry_forward_days = 0,
        available_days = 0,
        expired_date = v_end,
        updated_at = now()
    WHERE leave_type_id = v_co_type
      AND year = extract(year from v_start)::integer
      AND quarter = ceil(extract(month from v_start) / 3.0)::integer;
  END IF;

  RETURN v_count;
END;
$$;