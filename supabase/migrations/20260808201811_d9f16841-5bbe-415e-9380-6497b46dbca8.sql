-- 1. Onboarding capture fields
ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS training_completion_date date,
  ADD COLUMN IF NOT EXISTS post_training_ctc numeric;

-- 2. Payroll input provenance
ALTER TABLE public.hr_payroll_input_deductions
  ADD COLUMN IF NOT EXISTS source_revision_id uuid;
ALTER TABLE public.hr_payroll_input_additions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_revision_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ded_training_ctc_adj
  ON public.hr_payroll_input_deductions (hr_employee_id, period_month, source_revision_id)
  WHERE source_revision_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_add_training_ctc_adj
  ON public.hr_payroll_input_additions (hr_employee_id, period_month, source_revision_id)
  WHERE source_revision_id IS NOT NULL;

-- 3. Date-bounded LOP: same engine as hr_lop_days, restricted to a window
CREATE OR REPLACE FUNCTION public.hr_lop_days_window(
  p_employee_ids uuid[], p_period_month date, p_from date DEFAULT NULL, p_to date DEFAULT NULL
)
RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, paid_leave_days numeric,
              unpaid_leave_days numeric, incomplete_held_days numeric, absent_days numeric,
              half_days numeric, lop_days numeric, formula text, weekly_off_days integer[],
              weekly_off_source text, config_errors text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_win_start   date := GREATEST(date_trunc('month', p_period_month)::date, COALESCE(p_from, date_trunc('month', p_period_month)::date));
  v_win_end     date := LEAST((date_trunc('month', p_period_month) + interval '1 month - 1 day')::date,
                              COALESCE(p_to, (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date));
  v_elapsed_end date;
  v_default_pattern int[] := ARRAY[0];
  v_first_active_pattern int[];
BEGIN
  v_elapsed_end := LEAST(v_win_end, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  IF v_win_end < v_win_start THEN RETURN; END IF;

  SELECT p.weekly_offs INTO v_first_active_pattern
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true AND p.weekly_offs IS NOT NULL AND array_length(p.weekly_offs, 1) > 0
  ORDER BY p.created_at NULLS LAST LIMIT 1;
  IF v_first_active_pattern IS NOT NULL AND array_length(v_first_active_pattern,1) > 0 THEN
    v_default_pattern := v_first_active_pattern;
  END IF;

  RETURN QUERY
  WITH
  hols AS (
    SELECT h.date::date AS d FROM public.hr_holidays h
    WHERE h.is_active = true AND h.date BETWEEN v_month_start AND v_month_end
    UNION
    SELECT make_date(EXTRACT(YEAR FROM v_month_start)::int, EXTRACT(MONTH FROM h.date)::int, EXTRACT(DAY FROM h.date)::int)
    FROM public.hr_holidays h
    WHERE h.is_active = true AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_month_start)::int
  ),
  punch_days AS (
    SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
    FROM public.hr_attendance_punches p
    WHERE p.employee_id = ANY(p_employee_ids)
      AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_win_start AND v_win_end
    GROUP BY 1,2
  ),
  session_days AS (
    SELECT s.employee_id AS emp_id, s.attendance_date AS dt
    FROM public.hr_attendance_sessions s
    WHERE s.employee_id = ANY(p_employee_ids) AND s.attendance_date BETWEEN v_win_start AND v_win_end
    GROUP BY 1,2
  ),
  evidence_days AS (SELECT emp_id, dt FROM punch_days UNION SELECT emp_id, dt FROM session_days),
  blackout AS (
    SELECT d::date AS dt
    FROM generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d
    WHERE NOT EXISTS (SELECT 1 FROM public.hr_attendance_punches p
                      WHERE (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date = d::date)
  ),
  emp_pat AS (
    SELECT e.id AS emp_id,
      COALESCE((SELECT p.weekly_offs FROM public.hr_employee_weekly_off eo
                JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
                WHERE eo.employee_id = e.id AND eo.is_current = true AND eo.effective_from <= v_month_end
                ORDER BY eo.effective_from DESC LIMIT 1), v_default_pattern) AS off_days,
      CASE WHEN EXISTS (SELECT 1 FROM public.hr_employee_weekly_off eo
                        WHERE eo.employee_id = e.id AND eo.is_current = true) THEN 'per_employee'
           WHEN v_first_active_pattern IS NOT NULL THEN 'tenant_default_pattern'
           ELSE 'hardcoded_sunday' END AS wo_source,
      public.hr_is_contractor(e.id) AS is_contractor,
      GREATEST(v_win_start,
        COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi
                  WHERE wi.employee_id = e.id ORDER BY wi.joining_date NULLS LAST LIMIT 1), v_win_start)) AS emp_from,
      LEAST(v_elapsed_end, COALESCE(e.last_working_day, e.termination_date, v_elapsed_end)) AS emp_to
    FROM public.hr_employees e WHERE e.id = ANY(p_employee_ids)
  ),
  cal AS (
    SELECT ep.emp_id, d::date AS dt, ep.off_days, ep.wo_source,
      CASE WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
           WHEN d::date IN (SELECT d FROM hols) THEN false
           ELSE true END AS is_working,
      (d::date >= ep.emp_from AND d::date <= ep.emp_to) AS in_window
    FROM emp_pat ep
    CROSS JOIN generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d
  ),
  wd AS (
    SELECT emp_id, off_days, wo_source,
           COUNT(*) FILTER (WHERE is_working)::numeric AS wdays,
           COUNT(*) FILTER (WHERE is_working AND in_window)::numeric AS wdays_elapsed
    FROM cal GROUP BY emp_id, off_days, wo_source
  ),
  day_rows AS (
    SELECT c.emp_id, c.dt, LOWER(COALESCE(a.status,'')) AS st,
      (COALESCE(a.total_hours,0) > 0 OR a.first_in IS NOT NULL OR COALESCE(a.punch_count,0) > 0
        OR COALESCE(a.session_count,0) > 0 OR ev.dt IS NOT NULL) AS has_evidence,
      EXISTS (SELECT 1 FROM public.hr_attendance_regularization_requests r
              WHERE r.employee_id = c.emp_id AND r.attendance_date = c.dt AND LOWER(r.status) = 'approved') AS regularized,
      (bo.dt IS NOT NULL) AS is_blackout,
      public.hr_stale_session_held(c.emp_id, c.dt) AS stale_held,
      (a.employee_id IS NOT NULL) AS has_daily_row
    FROM cal c
    LEFT JOIN public.hr_attendance_daily a ON a.employee_id = c.emp_id AND a.attendance_date = c.dt
    LEFT JOIN evidence_days ev ON ev.emp_id = c.emp_id AND ev.dt = c.dt
    LEFT JOIN blackout bo ON bo.dt = c.dt
    WHERE c.is_working AND c.in_window
  ),
  att AS (
    SELECT r.emp_id,
      SUM(CASE WHEN r.st = 'half_day' AND (r.has_evidence OR r.regularized) THEN 0.5
               WHEN r.st IN ('absent','on_leave') THEN 0
               WHEN r.has_evidence OR r.regularized THEN 1 ELSE 0 END)::numeric AS present_d,
      SUM(CASE WHEN r.st = 'absent' THEN 1 ELSE 0 END)::numeric AS absent_d,
      SUM(CASE WHEN r.st = 'half_day' THEN 1 ELSE 0 END)::numeric AS half_d,
      SUM(CASE WHEN r.st = 'incomplete' AND (r.stale_held OR r.regularized) THEN 1
               WHEN r.is_blackout AND NOT r.has_evidence AND r.st NOT IN ('absent','on_leave') THEN 1
               ELSE 0 END)::numeric AS incomplete_held_d,
      SUM(CASE WHEN r.st IN ('present','half_day') AND NOT r.has_evidence AND NOT r.regularized
                    AND NOT r.is_blackout THEN 1 ELSE 0 END)::numeric AS unverified_d,
      COUNT(*) FILTER (WHERE r.has_evidence)::numeric AS evidence_day_count
    FROM day_rows r GROUP BY r.emp_id
  ),
  lv AS (
    SELECT lr.employee_id AS emp_id, lt.is_paid, lt.name AS lt_name, lr.leave_type_id,
           lr.start_date, lr.end_date, lr.is_half_day
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ANY(p_employee_ids) AND LOWER(lr.status) = 'approved'
      AND lr.start_date <= v_win_end AND lr.end_date >= v_win_start
  ),
  lv_days AS (
    SELECT lv.emp_id, lv.is_paid, SUM(CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END)::numeric AS days
    FROM lv
    JOIN LATERAL generate_series(GREATEST(lv.start_date, v_win_start)::timestamp,
                                 LEAST(lv.end_date, v_win_end)::timestamp, interval '1 day') d ON true
    JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL
    GROUP BY lv.emp_id, lv.is_paid
  ),
  lv_cfg AS (
    SELECT emp_id, ARRAY_AGG(DISTINCT format('Leave type "%s" has no paid/unpaid setting — fix it before payroll.',
      COALESCE(lt_name, leave_type_id::text))) AS errs
    FROM lv WHERE is_paid IS NULL GROUP BY emp_id
  ),
  paid   AS (SELECT emp_id, SUM(days) AS d FROM lv_days WHERE is_paid=true  GROUP BY emp_id),
  unpaid AS (SELECT emp_id, SUM(days) AS d FROM lv_days WHERE is_paid=false GROUP BY emp_id),
  calc AS (
    SELECT ep.emp_id, ep.is_contractor, ep.off_days, ep.wo_source,
      COALESCE(wd.wdays,0)::numeric AS wdays,
      COALESCE(wd.wdays_elapsed,0)::numeric AS wdays_elapsed,
      COALESCE(att.present_d,0)::numeric AS present_d,
      COALESCE(att.absent_d,0)::numeric AS absent_d,
      COALESCE(att.half_d,0)::numeric AS half_d,
      COALESCE(att.incomplete_held_d,0)::numeric AS held_d,
      COALESCE(att.unverified_d,0)::numeric AS unverified_d,
      COALESCE(att.evidence_day_count,0)::numeric AS evidence_day_count,
      COALESCE(paid.d,0)::numeric AS paid_d,
      COALESCE(unpaid.d,0)::numeric AS unpaid_d,
      COALESCE(lv_cfg.errs, ARRAY[]::text[]) AS errs
    FROM emp_pat ep
    LEFT JOIN wd ON wd.emp_id=ep.emp_id
    LEFT JOIN att ON att.emp_id=ep.emp_id
    LEFT JOIN paid ON paid.emp_id=ep.emp_id
    LEFT JOIN unpaid ON unpaid.emp_id=ep.emp_id
    LEFT JOIN lv_cfg ON lv_cfg.emp_id=ep.emp_id
  )
  SELECT c.emp_id, c.wdays, c.present_d, c.paid_d, c.unpaid_d, c.held_d, c.absent_d, c.half_d,
    CASE WHEN c.is_contractor THEN 0::numeric
         WHEN c.evidence_day_count = 0 AND c.paid_d = 0 THEN 0::numeric
         ELSE GREATEST(0, LEAST(c.wdays_elapsed, c.wdays_elapsed - c.present_d - c.paid_d - c.held_d))::numeric END,
    CASE WHEN c.is_contractor
           THEN 'LOP = 0 (contract employee — attendance shown for reference, never deducted)'
         WHEN c.evidence_day_count = 0 AND c.paid_d = 0
           THEN 'LOP not derived — no biometric attendance signal in the window (employee not enrolled or device user not mapped).'
         ELSE format('LOP = elapsed WD %s (of %s) − (verified present %s + paid_leave %s + held_harmless %s) = %s%s',
           c.wdays_elapsed, c.wdays, c.present_d, c.paid_d, c.held_d,
           GREATEST(0, LEAST(c.wdays_elapsed, c.wdays_elapsed - c.present_d - c.paid_d - c.held_d)),
           CASE WHEN c.unverified_d > 0
                THEN format(' · %s day(s) marked present with no punch evidence — not counted as attended', c.unverified_d)
                ELSE '' END) END,
    c.off_days::int[], c.wo_source,
    CASE WHEN c.evidence_day_count = 0 AND NOT c.is_contractor
           THEN c.errs || ARRAY['No biometric attendance signal in the window — enrolment/device mapping missing; LOP suppressed for review.']
         ELSE c.errs END
  FROM calc c;
END;
$function$;

-- keep the month-level API as a thin wrapper over the windowed engine
CREATE OR REPLACE FUNCTION public.hr_lop_days(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, paid_leave_days numeric,
              unpaid_leave_days numeric, incomplete_held_days numeric, absent_days numeric,
              half_days numeric, lop_days numeric, formula text, weekly_off_days integer[],
              weekly_off_source text, config_errors text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT * FROM public.hr_lop_days_window(p_employee_ids, p_period_month, NULL, NULL);
$function$;

-- 4. Training-completion CTC adjustment calculator
CREATE OR REPLACE FUNCTION public.hr_training_ctc_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_month_start date; v_month_end date; v_n int;
  v_join date; v_exit date; v_ws date; v_we date;
  v_g1 numeric; v_g2 numeric;
  v_t date; v_old_end date; v_d_old int; v_d_new int;
  v_lop_before numeric := 0; v_lop_after numeric := 0;
  v_processed boolean;
  v_kind text; v_amount numeric; v_period date;
BEGIN
  SELECT sr.id, sr.employee_id, sr.effective_from, sr.previous_total, sr.new_total, sr.revision_reason
    INTO r FROM public.hr_salary_revisions sr WHERE sr.id = p_revision_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'revision not found'); END IF;
  IF COALESCE(r.previous_total,0) = 0 OR r.new_total IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing previous/new CTC');
  END IF;

  v_t := r.effective_from;
  v_month_start := date_trunc('month', v_t)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_n := EXTRACT(DAY FROM v_month_end)::int;
  v_g1 := r.previous_total / 12.0;
  v_g2 := r.new_total / 12.0;

  SELECT (SELECT wi.joining_date FROM public.hr_employee_work_info wi
          WHERE wi.employee_id = r.employee_id ORDER BY wi.joining_date NULLS LAST LIMIT 1),
         COALESCE(e.last_working_day, e.termination_date)
    INTO v_join, v_exit
  FROM public.hr_employees e WHERE e.id = r.employee_id;

  v_ws := GREATEST(v_month_start, COALESCE(v_join, v_month_start));
  v_we := LEAST(v_month_end, COALESCE(v_exit, v_month_end));

  IF v_t < v_ws OR v_t > v_we THEN
    RETURN jsonb_build_object('ok', true, 'amount', 0, 'kind', 'none',
      'reason', 'effective date outside the employment window for this month');
  END IF;

  v_old_end := LEAST(v_t - 1, v_we);
  v_d_old := GREATEST(0, (v_old_end - v_ws) + 1);
  v_d_new := GREATEST(0, (v_we - GREATEST(v_t, v_ws)) + 1);

  IF v_d_old > 0 THEN
    SELECT COALESCE(SUM(l.lop_days),0) INTO v_lop_before
    FROM public.hr_lop_days_window(ARRAY[r.employee_id]::uuid[], v_month_start, v_ws, v_old_end) l;
  END IF;
  IF v_d_new > 0 THEN
    SELECT COALESCE(SUM(l.lop_days),0) INTO v_lop_after
    FROM public.hr_lop_days_window(ARRAY[r.employee_id]::uuid[], v_month_start, GREATEST(v_t, v_ws), v_we) l;
  END IF;

  -- Was the transition month already paid out (payslip exists)? Then Razorpay
  -- paid it at the OLD CTC and we owe arrears in the following month instead.
  SELECT EXISTS (
    SELECT 1 FROM public.hr_payslips ps
    WHERE ps.employee_id = r.employee_id
      AND date_trunc('month', ps.period_month)::date = v_month_start
  ) INTO v_processed;

  IF v_processed THEN
    v_amount := (v_g2 - v_g1) * (GREATEST(0, v_d_new - v_lop_after)) / v_n;
    v_period := (v_month_start + interval '1 month')::date;
    v_kind := CASE WHEN v_amount >= 0 THEN 'addition' ELSE 'deduction' END;
  ELSE
    v_amount := (v_g2 - v_g1) * (GREATEST(0, v_d_old - v_lop_before)) / v_n;
    v_period := v_month_start;
    v_kind := CASE WHEN v_amount >= 0 THEN 'deduction' ELSE 'addition' END;
  END IF;

  v_amount := round(v_amount);
  IF abs(v_amount) < 10 THEN v_kind := 'none'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', r.id,
    'employee_id', r.employee_id,
    'kind', v_kind,
    'amount', abs(v_amount),
    'signed_amount', v_amount,
    'period_month', v_period,
    'mode', CASE WHEN v_processed THEN 'arrears' ELSE 'recovery' END,
    'derivation', jsonb_build_object(
      'old_ctc', r.previous_total, 'new_ctc', r.new_total,
      'monthly_old', round(v_g1, 2), 'monthly_new', round(v_g2, 2),
      'effective_from', v_t, 'calendar_days', v_n,
      'window_start', v_ws, 'window_end', v_we,
      'days_before', v_d_old, 'days_after', v_d_new,
      'lop_before', v_lop_before, 'lop_after', v_lop_after,
      'paid_days_before', GREATEST(0, v_d_old - v_lop_before),
      'paid_days_after', GREATEST(0, v_d_new - v_lop_after),
      'divisor', v_n
    )
  );
END;
$function$;

-- 5. Idempotent staging of the adjustment (server-side use only)
CREATE OR REPLACE FUNCTION public.hr_stage_training_ctc_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  calc jsonb; v_kind text; v_amount numeric; v_period date; v_emp uuid; v_rp text; v_label text;
BEGIN
  calc := public.hr_training_ctc_adjustment(p_revision_id);
  IF NOT COALESCE((calc->>'ok')::boolean, false) THEN RETURN calc; END IF;
  v_kind := calc->>'kind';
  IF v_kind = 'none' THEN RETURN calc || jsonb_build_object('staged', false); END IF;

  v_amount := (calc->>'amount')::numeric;
  v_period := (calc->>'period_month')::date;
  v_emp := (calc->>'employee_id')::uuid;
  SELECT em.razorpay_employee_id INTO v_rp
  FROM public.hr_razorpay_employee_map em WHERE em.hr_employee_id = v_emp LIMIT 1;

  v_label := format('Training CTC adjustment (eff %s)', calc->'derivation'->>'effective_from');

  IF v_kind = 'deduction' THEN
    INSERT INTO public.hr_payroll_input_deductions
      (hr_employee_id, razorpay_employee_id, period_month, label, amount, source, source_revision_id)
    VALUES (v_emp, v_rp, v_period, v_label, v_amount, 'training_ctc_adjustment', p_revision_id)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id) DO NOTHING;
  ELSE
    INSERT INTO public.hr_payroll_input_additions
      (hr_employee_id, razorpay_employee_id, period_month, label, amount, addition_type, taxable, source, source_revision_id)
    VALUES (v_emp, v_rp, v_period, v_label, v_amount, 1, true, 'training_ctc_adjustment', p_revision_id)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id) DO NOTHING;
  END IF;

  RETURN calc || jsonb_build_object('staged', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_stage_training_ctc_adjustment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_stage_training_ctc_adjustment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_training_ctc_adjustment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_lop_days_window(uuid[], date, date, date) TO authenticated, service_role;