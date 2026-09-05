-- 1) Scope the auto-CL absorption reversal to the employees being recalculated.
CREATE OR REPLACE FUNCTION public.hr_apply_cl_lop_absorption(
  p_absorptions jsonb,
  p_period_month date,
  p_scope_employee_ids uuid[] DEFAULT NULL
)
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
BEGIN
  SELECT id INTO v_cl FROM public.hr_leave_types WHERE code = 'CL' AND is_active LIMIT 1;
  IF v_cl IS NULL THEN RAISE EXCEPTION 'No active Casual Leave type (code CL)'; END IF;

  -- 3a. Reverse previous auto absorption for this month, but ONLY for the
  -- employees in scope. A partial staging run must never cancel the booked
  -- casual leave of employees it is not recalculating.
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
$function$;

-- 2) Only stamp comp-off credits as "encashed" when the payout is actually created.
CREATE OR REPLACE FUNCTION public.hr_settle_compoff_credits(
  p_period_month date,
  p_rows jsonb,
  p_settle_encash boolean DEFAULT true
)
 RETURNS TABLE(out_employee_id uuid, settled_offset numeric, settled_encash numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  r record;
  c record;
  v_done_offset numeric;
  v_done_encash numeric;
  v_want_encash numeric;
BEGIN
  FOR r IN
    SELECT (x->>'employee_id')::uuid AS emp_id,
           GREATEST(COALESCE((x->>'offset_days')::numeric, 0), 0) AS offset_days,
           GREATEST(COALESCE((x->>'encash_days')::numeric, 0), 0) AS encash_days
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) x
  LOOP
    v_want_encash := CASE WHEN p_settle_encash THEN r.encash_days ELSE 0 END;

    -- Reset this month's settlement for this employee so re-runs are idempotent.
    -- Credits whose encashment has already been pushed to RazorpayX are never
    -- unsettled — the money is out, the day is spent.
    UPDATE public.hr_compoff_credits cc
       SET settled_period_month = NULL,
           settlement_outcome = NULL
     WHERE cc.employee_id = r.emp_id
       AND cc.settled_period_month = v_start
       AND cc.settlement_outcome IN ('offset_lop', 'encashed')
       AND NOT (
         cc.settlement_outcome = 'encashed'
         AND EXISTS (
           SELECT 1 FROM public.hr_payroll_input_additions a
           WHERE a.hr_employee_id = r.emp_id
             AND a.period_month = v_start
             AND a.source = 'auto_compoff'
             AND a.pushed_at IS NOT NULL
         )
       );

    v_done_offset := 0;
    v_done_encash := 0;

    FOR c IN
      SELECT cc.id, cc.credit_days
      FROM public.hr_compoff_credits cc
      WHERE cc.employee_id = r.emp_id
        AND cc.credit_date <= v_end
        AND cc.settled_period_month IS NULL
        AND COALESCE(cc.settlement_outcome, '') <> 'voided_no_attendance_evidence'
      ORDER BY cc.credit_date, cc.id
      FOR UPDATE
    LOOP
      IF v_done_offset < r.offset_days THEN
        UPDATE public.hr_compoff_credits cc
           SET settled_period_month = v_start,
               settlement_outcome = 'offset_lop'
         WHERE cc.id = c.id;
        v_done_offset := v_done_offset + COALESCE(c.credit_days, 0);
      ELSIF v_done_encash < v_want_encash THEN
        UPDATE public.hr_compoff_credits cc
           SET settled_period_month = v_start,
               settlement_outcome = 'encashed'
         WHERE cc.id = c.id;
        v_done_encash := v_done_encash + COALESCE(c.credit_days, 0);
      ELSE
        EXIT;
      END IF;
    END LOOP;

    out_employee_id := r.emp_id;
    settled_offset := v_done_offset;
    settled_encash := v_done_encash;
    RETURN NEXT;
  END LOOP;
END;
$function$;