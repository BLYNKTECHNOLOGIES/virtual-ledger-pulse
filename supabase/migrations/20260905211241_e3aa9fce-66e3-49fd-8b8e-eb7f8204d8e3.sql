-- 1. Nightly reconciler must ignore the system's synthetic absorption leave.
CREATE OR REPLACE FUNCTION public.hr_reconcile_worked_leave_days(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT lr.employee_id, d.attendance_date, lr.id AS leave_request_id, lr.leave_type_id,
           CASE WHEN COALESCE(lr.is_half_day, false) THEN 0.5 ELSE 1 END AS days_restored,
           COALESCE(d.net_work_minutes, 0) AS net_work_minutes
      FROM public.hr_attendance_daily d
      JOIN public.hr_leave_requests lr
        ON lr.employee_id = d.employee_id
       AND LOWER(lr.status) = 'approved'
       AND COALESCE(lr.source, '') <> 'auto_lop_absorption'
       AND d.attendance_date BETWEEN lr.start_date AND lr.end_date
     WHERE d.attendance_date BETWEEN p_from AND p_to
       AND (p_employee_id IS NULL OR d.employee_id = p_employee_id)
       AND (COALESCE(d.net_work_minutes, 0) > 0 OR COALESCE(d.punch_count, 0) > 0)
       AND NOT EXISTS (
             SELECT 1 FROM public.hr_leave_worked_days w
              WHERE w.employee_id = d.employee_id AND w.attendance_date = d.attendance_date)
     ORDER BY d.attendance_date
  LOOP
    INSERT INTO public.hr_leave_worked_days
          (employee_id, attendance_date, leave_request_id, leave_type_id, days_restored, net_work_minutes)
    VALUES (r.employee_id, r.attendance_date, r.leave_request_id, r.leave_type_id, r.days_restored, r.net_work_minutes)
    ON CONFLICT (employee_id, attendance_date) DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF r.leave_type_id IS NOT NULL THEN
      PERFORM public.hr_move_leave_balance(
        r.employee_id, r.leave_type_id, r.attendance_date, r.attendance_date, r.days_restored, 1);
    END IF;

    UPDATE public.hr_attendance_daily
       SET flags = COALESCE(flags, '{}'::jsonb)
                   || jsonb_build_object('worked_on_approved_leave', true,
                                         'leave_request_id', r.leave_request_id),
           updated_at = now()
     WHERE employee_id = r.employee_id
       AND attendance_date = r.attendance_date;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

-- 2. Only casual leave credited on or before the month end may absorb that month's LOP.
CREATE OR REPLACE FUNCTION public.hr_cl_available(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, cl_available numeric, cl_auto_booked numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ms AS (
    SELECT EXTRACT(YEAR FROM date_trunc('month', p_period_month))::int AS y,
           EXTRACT(MONTH FROM date_trunc('month', p_period_month))::int AS m,
           date_trunc('month', p_period_month)::date AS d0,
           (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date AS d1
  ),
  emp AS (SELECT unnest(p_employee_ids) AS id),
  bal AS (
    SELECT e.id,
           COALESCE(SUM(GREATEST(COALESCE(a.allocated_days,0) - COALESCE(a.used_days,0), 0)), 0)::numeric AS bal
    FROM emp e
    CROSS JOIN ms
    LEFT JOIN public.hr_leave_allocations a
      ON a.employee_id = e.id
     AND a.expired_date IS NULL
     AND (
           a.year < ms.y
           OR (a.year = ms.y AND a.month IS NOT NULL AND a.month <= ms.m)
           OR (a.year = ms.y AND a.month IS NULL
               AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ms.d1)
         )
     AND a.leave_type_id IN (SELECT id FROM public.hr_leave_types WHERE code = 'CL')
    GROUP BY e.id
  ),
  auto AS (
    SELECT e.id,
           COALESCE(SUM(c.days), 0)::numeric AS booked
    FROM emp e
    CROSS JOIN ms
    LEFT JOIN public.hr_leave_requests lr
      ON lr.employee_id = e.id
     AND lr.source = 'auto_lop_absorption'
     AND lr.start_date BETWEEN ms.d0 AND ms.d1
    LEFT JOIN public.hr_leave_request_consumption c ON c.request_id = lr.id
    GROUP BY e.id
  )
  SELECT b.id, GREATEST(b.bal, 0) + COALESCE(a.booked, 0), COALESCE(a.booked, 0)
  FROM bal b LEFT JOIN auto a ON a.id = b.id;
$function$;

-- 3. Book the absorption on a real absent date, from allocations credited within the month.
CREATE OR REPLACE FUNCTION public.hr_apply_cl_lop_absorption(p_absorptions jsonb, p_period_month date, p_scope_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(employee_id uuid, days_booked numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_day date;
BEGIN
  SELECT id INTO v_cl FROM public.hr_leave_types WHERE code = 'CL' AND is_active LIMIT 1;
  IF v_cl IS NULL THEN RAISE EXCEPTION 'No active Casual Leave type (code CL)'; END IF;

  FOR r IN
    SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date
    FROM public.hr_leave_requests lr
    WHERE lr.source = 'auto_lop_absorption'
      AND lr.start_date BETWEEN v_start AND v_end
      AND (p_scope_employee_ids IS NULL OR lr.employee_id = ANY (p_scope_employee_ids))
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
        AND (
              al.year < EXTRACT(YEAR FROM v_start)::int
              OR (al.year = EXTRACT(YEAR FROM v_start)::int AND al.month IS NOT NULL
                  AND al.month <= EXTRACT(MONTH FROM v_start)::int)
              OR (al.year = EXTRACT(YEAR FROM v_start)::int AND al.month IS NULL
                  AND (al.created_at AT TIME ZONE 'Asia/Kolkata')::date <= v_end)
            )
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

    -- Anchor the synthetic entry on a real absent day (no punches), not the month end.
    SELECT d.attendance_date INTO v_day
      FROM public.hr_attendance_daily d
     WHERE d.employee_id = r.emp_id
       AND d.attendance_date BETWEEN v_start AND v_end
       AND LOWER(COALESCE(d.manual_status, d.status, '')) IN ('absent', 'half_day')
       AND COALESCE(d.punch_count, 0) = 0
       AND COALESCE(d.net_work_minutes, 0) = 0
     ORDER BY d.attendance_date
     LIMIT 1;

    IF v_day IS NULL THEN
      v_day := v_end;
    END IF;

    INSERT INTO public.hr_leave_requests(
      employee_id, leave_type_id, start_date, end_date, total_days, status,
      reason, manager_status, approved_at, paid_days, unpaid_days, source)
    VALUES (
      r.emp_id, v_cl, v_day, v_day, v_booked, 'approved',
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
$function$;