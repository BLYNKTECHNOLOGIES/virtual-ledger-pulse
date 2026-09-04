-- 1. CL availability per employee for a payroll month (reporting + engine input)
CREATE OR REPLACE FUNCTION public.hr_cl_available(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(employee_id uuid, cl_available numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ms AS (
    SELECT EXTRACT(YEAR FROM date_trunc('month', p_period_month))::int AS y,
           EXTRACT(MONTH FROM date_trunc('month', p_period_month))::int AS m
  ),
  emp AS (SELECT unnest(p_employee_ids) AS id)
  SELECT e.id,
         COALESCE((
           SELECT GREATEST(SUM(GREATEST(COALESCE(a.allocated_days,0) - COALESCE(a.used_days,0), 0)), 0)
           FROM public.hr_leave_allocations a
           JOIN public.hr_leave_types t ON t.id = a.leave_type_id
           , ms
           WHERE a.employee_id = e.id
             AND t.code = 'CL'
             AND a.expired_date IS NULL
             AND (a.year < ms.y OR (a.year = ms.y AND (a.month IS NULL OR a.month <= ms.m)))
         ), 0)::numeric
  FROM emp e;
$$;

REVOKE ALL ON FUNCTION public.hr_cl_available(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_cl_available(uuid[], date) TO authenticated, service_role;

-- 2. Auto-absorption records must not be date-guarded, stamped onto attendance,
--    or broadcast as employee leave notifications.
CREATE OR REPLACE FUNCTION public.validate_leave_request_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end_date (%) cannot be before start_date (%)', NEW.end_date, NEW.start_date;
  END IF;
  IF NEW.total_days IS NOT NULL AND NEW.total_days <= 0 THEN
    RAISE EXCEPTION 'Leave total_days must be greater than 0, got %', NEW.total_days;
  END IF;
  -- Payroll-generated LOP absorption is booked for a closed/closing payroll
  -- month, so the current-month backdating guard does not apply to it.
  IF COALESCE(NEW.source, '') = 'auto_lop_absorption' THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND NEW.start_date < date_trunc('month', CURRENT_DATE)::DATE THEN
    RAISE EXCEPTION 'Leave start_date (%) cannot be before the start of the current month (%)',
      NEW.start_date, date_trunc('month', CURRENT_DATE)::DATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_trg_stamp_leave_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Auto LOP absorption is a payroll-side settlement of days that are already
  -- marked absent/half-day. It must never rewrite the attendance record.
  IF COALESCE(NEW.source, '') = 'auto_lop_absorption' THEN
    RETURN NEW;
  END IF;
  PERFORM public.hr_stamp_leave_attendance(NEW.id);
  RETURN NEW;
END;
$$;

-- 3. Apply / reverse the CL absorption for a payroll month.
CREATE OR REPLACE FUNCTION public.hr_apply_cl_lop_absorption(p_absorptions jsonb, p_period_month date)
RETURNS TABLE(employee_id uuid, days_booked numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_cl uuid;
  r record;
  c record;
  a record;
  v_want numeric;
  v_take numeric;
  v_booked numeric;
  v_req uuid;
BEGIN
  SELECT id INTO v_cl FROM public.hr_leave_types WHERE code = 'CL' AND is_active LIMIT 1;
  IF v_cl IS NULL THEN RAISE EXCEPTION 'No active Casual Leave type (code CL)'; END IF;

  -- 3a. Reverse any previous auto absorption for this month.
  FOR r IN
    SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date
    FROM public.hr_leave_requests lr
    WHERE lr.source = 'auto_lop_absorption'
      AND lr.start_date BETWEEN v_start AND v_end
  LOOP
    FOR c IN
      SELECT * FROM public.hr_leave_request_consumption
      WHERE request_id = r.id AND leave_type_id IS NOT NULL
    LOOP
      PERFORM public.hr_move_leave_balance(r.employee_id, c.leave_type_id, r.start_date, r.end_date, c.days, 1);
    END LOOP;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = r.id;
    DELETE FROM public.hr_leave_requests WHERE id = r.id;
  END LOOP;

  -- 3b. Book the new absorption, clamped to what the employee actually has.
  FOR r IN
    SELECT (x->>'employee_id')::uuid AS emp_id, COALESCE((x->>'days')::numeric, 0) AS days
    FROM jsonb_array_elements(COALESCE(p_absorptions, '[]'::jsonb)) x
  LOOP
    v_want := ROUND(GREATEST(r.days, 0)::numeric, 2);
    CONTINUE WHEN v_want <= 0;

    v_booked := 0;
    FOR a IN
      SELECT al.id, GREATEST(COALESCE(al.allocated_days,0) - COALESCE(al.used_days,0), 0) AS avail
      FROM public.hr_leave_allocations al
      WHERE al.employee_id = r.emp_id
        AND al.leave_type_id = v_cl
        AND al.expired_date IS NULL
        AND (al.year < EXTRACT(YEAR FROM v_start)::int
             OR (al.year = EXTRACT(YEAR FROM v_start)::int
                 AND (al.month IS NULL OR al.month <= EXTRACT(MONTH FROM v_start)::int)))
      ORDER BY al.year, COALESCE(al.month, 0), COALESCE(al.quarter, 0)
      FOR UPDATE
    LOOP
      EXIT WHEN v_booked >= v_want;
      v_take := LEAST(v_want - v_booked, a.avail);
      IF v_take > 0 THEN
        UPDATE public.hr_leave_allocations
           SET used_days = COALESCE(used_days,0) + v_take,
               available_days = GREATEST(COALESCE(available_days,0) - v_take, 0),
               updated_at = now()
         WHERE id = a.id;
        v_booked := v_booked + v_take;
      END IF;
    END LOOP;

    CONTINUE WHEN v_booked <= 0;

    INSERT INTO public.hr_leave_requests(
      employee_id, leave_type_id, start_date, end_date, total_days, status,
      reason, manager_status, approved_at, paid_days, unpaid_days, source)
    VALUES (
      r.emp_id, v_cl, v_end, v_end, v_booked, 'approved',
      'Auto-applied casual leave to cancel loss of pay for ' || to_char(v_start, 'Mon YYYY') || ' payroll',
      'not_applicable', now(), v_booked, 0, 'auto_lop_absorption')
    RETURNING id INTO v_req;

    INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
    VALUES (v_req, r.emp_id, v_cl, v_booked, 'assigned');

    employee_id := r.emp_id;
    days_booked := v_booked;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_apply_cl_lop_absorption(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_apply_cl_lop_absorption(jsonb, date) TO service_role;
