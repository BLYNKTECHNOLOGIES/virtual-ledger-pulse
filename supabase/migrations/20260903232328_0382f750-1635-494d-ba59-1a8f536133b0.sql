-- 1) Comp-off pool: a month's own credits stay in that month's pool even if the
--    month was already marked closed/settled (premature auto-close must not
--    silently erase the balance before LOP offset + encashment run).
CREATE OR REPLACE FUNCTION public.hr_compoff_month_pool(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, days_earned numeric, days_opening numeric, days_taken numeric, days_available numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ms AS (SELECT date_trunc('month', p_period_month)::date AS s,
                     (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date AS e),
  emp AS (SELECT unnest(p_employee_ids) AS id),
  credits AS (
    SELECT c.employee_id,
           SUM(c.credit_days) FILTER (WHERE c.credit_date >= (SELECT s FROM ms)) AS earned,
           SUM(c.credit_days) FILTER (WHERE c.credit_date < (SELECT s FROM ms)) AS opening
    FROM public.hr_compoff_credits c, ms
    WHERE c.employee_id = ANY(p_employee_ids)
      AND c.credit_date <= ms.e
      AND (c.settled_period_month IS NULL OR c.settled_period_month = ms.s)
      AND COALESCE(c.settlement_outcome, '') <> 'voided_no_attendance_evidence'
    GROUP BY c.employee_id
  ),
  reqs AS (
    SELECT r.id, r.employee_id, COALESCE(r.total_days,0)::numeric AS total_days,
           (t.code = 'CO') AS is_co
    FROM public.hr_leave_requests r
    JOIN public.hr_leave_types t ON t.id = r.leave_type_id
    , ms
    WHERE r.employee_id = ANY(p_employee_ids)
      AND lower(r.status) = 'approved'
      AND r.start_date <= ms.e AND r.end_date >= ms.s
  ),
  cons AS (
    SELECT cs.request_id, cs.source, SUM(COALESCE(cs.days,0))::numeric AS days
    FROM public.hr_leave_request_consumption cs
    WHERE cs.request_id IN (SELECT id FROM reqs)
    GROUP BY cs.request_id, cs.source
  ),
  taken AS (
    SELECT q.employee_id, SUM(q.d)::numeric AS d
    FROM (
      SELECT r.employee_id, c.days AS d
      FROM cons c JOIN reqs r ON r.id = c.request_id
      WHERE c.source = 'compoff_fallback'
      UNION ALL
      SELECT r.employee_id,
             CASE WHEN NOT EXISTS (SELECT 1 FROM cons c WHERE c.request_id = r.id)
                    THEN r.total_days
                  ELSE COALESCE((SELECT SUM(c.days) FROM cons c
                                 WHERE c.request_id = r.id
                                   AND c.source IN ('assigned','compoff')), 0)
             END AS d
      FROM reqs r WHERE r.is_co
    ) q
    GROUP BY q.employee_id
  )
  SELECT emp.id,
         COALESCE(c.earned,0)::numeric,
         COALESCE(c.opening,0)::numeric,
         COALESCE(t.d,0)::numeric,
         GREATEST(COALESCE(c.earned,0) + COALESCE(c.opening,0) - COALESCE(t.d,0), 0)::numeric
  FROM emp
  LEFT JOIN credits c ON c.employee_id = emp.id
  LEFT JOIN taken t ON t.employee_id = emp.id;
$function$;

-- 2) Auto-close must follow the payroll cycle, not the calendar.
CREATE OR REPLACE FUNCTION public.hr_compoff_auto_close_prior_months()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_month date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_open_month date := public.hr_open_payroll_month();
  v_cutoff date := LEAST(v_current_month, v_open_month);
  v_month date;
  v_closed integer := 0;
  v_months date[] := '{}';
  v_n integer;
BEGIN
  FOR v_month IN
    SELECT DISTINCT date_trunc('month', credit_date)::date AS m
    FROM public.hr_compoff_credits
    WHERE settled_period_month IS NULL
      AND date_trunc('month', credit_date)::date < v_cutoff
    ORDER BY 1
  LOOP
    SELECT public.hr_compoff_close_month(v_month) INTO v_n;
    v_closed := v_closed + COALESCE(v_n, 0);
    v_months := v_months || v_month;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'current_month', v_current_month,
    'open_payroll_month', v_open_month,
    'months_closed', to_jsonb(v_months),
    'credits_closed', v_closed
  );
END;
$function$;

-- 3) Reopen the August 2026 credits closed prematurely by the 02-Sep cron run.
UPDATE public.hr_compoff_credits
SET settled_period_month = NULL, settlement_outcome = NULL
WHERE settled_period_month = date '2026-08-01'
  AND settlement_outcome = 'settled_in_payroll'
  AND credit_date BETWEEN date '2026-08-01' AND date '2026-08-31';

-- 4) Attendance summary: the unpaid half of a half-day is LOP, not "unverified".
CREATE OR REPLACE FUNCTION public.hr_attendance_month_summary(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, half_days numeric, absent_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, held_harmless_days numeric, unverified_days numeric, lop_days numeric, late_minutes numeric, early_minutes numeric, ot_hours numeric, evidence_days numeric, legacy_present_days numeric, no_biometric_signal boolean, formula text, config_errors text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_today       date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_elapsed_end date := LEAST(v_month_end, v_today);
BEGIN
  RETURN QUERY
  WITH canonical AS (
    SELECT * FROM public.hr_lop_days(p_employee_ids, v_month_start)
  ),
  legacy AS (
    SELECT a.employee_id AS emp_id,
      COUNT(*) FILTER (WHERE lower(coalesce(a.attendance_status, '')) IN ('present','late'))::numeric AS present_d,
      COALESCE(SUM(a.late_minutes),0)::numeric AS late_min,
      COALESCE(SUM(a.early_leave_minutes),0)::numeric AS early_min,
      COALESCE(SUM(a.overtime_hours),0)::numeric AS ot_h
    FROM public.hr_attendance a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_elapsed_end
    GROUP BY a.employee_id
  ),
  evidence AS (
    SELECT x.emp_id, COUNT(*)::numeric AS evidence_d
    FROM (
      SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
      FROM public.hr_attendance_punches p
      WHERE p.employee_id = ANY(p_employee_ids)
        AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_month_start AND v_month_end
      GROUP BY 1,2
      UNION
      SELECT s.employee_id, s.attendance_date
      FROM public.hr_attendance_sessions s
      WHERE s.employee_id = ANY(p_employee_ids)
        AND s.attendance_date BETWEEN v_month_start AND v_month_end
      GROUP BY 1,2
    ) x GROUP BY x.emp_id
  )
  SELECT
    c.employee_id,
    c.working_days,
    c.present_days,
    c.half_days,
    c.absent_days,
    c.paid_leave_days,
    c.unpaid_leave_days,
    c.incomplete_held_days,
    -- residual days with no attendance/leave account at all. The missing half of
    -- every half-day is deliberately excluded: it is already charged as LOP.
    GREATEST(0, c.working_days - c.present_days - c.paid_leave_days - c.unpaid_leave_days
                - c.absent_days - c.incomplete_held_days
                - (c.half_days * 0.5))::numeric AS unverified_days,
    c.lop_days,
    COALESCE(l.late_min, 0)::numeric,
    COALESCE(l.early_min, 0)::numeric,
    ROUND(COALESCE(l.ot_h, 0), 2)::numeric,
    COALESCE(e.evidence_d, 0)::numeric,
    COALESCE(l.present_d, 0)::numeric AS legacy_present_days,
    (COALESCE(e.evidence_d, 0) = 0) AS no_biometric_signal,
    c.formula,
    c.config_errors
  FROM canonical c
  LEFT JOIN legacy l ON l.emp_id = c.employee_id
  LEFT JOIN evidence e ON e.emp_id = c.employee_id;
END;
$function$;