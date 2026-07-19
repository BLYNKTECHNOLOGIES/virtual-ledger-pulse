
-- =====================================================================
-- 1. Shared LOP computation (single source of truth for shadow + push)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hr_compute_lop_days(
  p_employee_ids uuid[],
  p_period_month date
)
RETURNS TABLE (
  employee_id uuid,
  working_days numeric,
  present_days numeric,
  paid_leave_days numeric,
  unpaid_leave_days numeric,
  incomplete_unresolved_days numeric,
  lop_days numeric,
  formula text,
  weekly_off_days int[],
  weekly_off_source text,
  config_errors text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_default_pattern int[] := ARRAY[0];  -- Sunday-only fallback
  v_first_active_pattern int[];
BEGIN
  -- Resolve tenant default weekly-off pattern (first active pattern with a non-empty list).
  SELECT ARRAY(SELECT jsonb_array_elements_text(p.weekly_offs)::int)
  INTO v_first_active_pattern
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true
    AND jsonb_typeof(p.weekly_offs) = 'array'
    AND jsonb_array_length(p.weekly_offs) > 0
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;
  IF v_first_active_pattern IS NOT NULL AND array_length(v_first_active_pattern, 1) > 0 THEN
    v_default_pattern := v_first_active_pattern;
  END IF;

  RETURN QUERY
  WITH
  -- All holiday dates in the month (in-month + recurring by month-day).
  hols AS (
    SELECT h.date::date AS d
    FROM public.hr_holidays h
    WHERE h.is_active = true
      AND h.date BETWEEN v_month_start AND v_month_end
    UNION
    SELECT make_date(
             EXTRACT(YEAR FROM v_month_start)::int,
             EXTRACT(MONTH FROM h.date)::int,
             EXTRACT(DAY FROM h.date)::int
           )
    FROM public.hr_holidays h
    WHERE h.is_active = true
      AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_month_start)::int
  ),
  -- Per-employee weekly-off pattern (override → tenant default).
  emp_pat AS (
    SELECT
      e.id AS emp_id,
      COALESCE(
        (SELECT ARRAY(SELECT jsonb_array_elements_text(p.weekly_offs)::int)
         FROM public.hr_employee_weekly_off eo
         JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
         WHERE eo.employee_id = e.id
           AND eo.is_current = true
           AND eo.effective_from <= v_month_end
         ORDER BY eo.effective_from DESC
         LIMIT 1),
        v_default_pattern
      ) AS off_days,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.hr_employee_weekly_off eo
          WHERE eo.employee_id = e.id AND eo.is_current = true
        ) THEN 'per_employee'
        WHEN v_first_active_pattern IS NOT NULL THEN 'tenant_default_pattern'
        ELSE 'hardcoded_sunday'
      END AS wo_source
    FROM public.hr_employees e
    WHERE e.id = ANY(p_employee_ids)
  ),
  -- Calendar of month days per employee, tagged working/off.
  cal AS (
    SELECT
      ep.emp_id,
      d::date AS dt,
      ep.off_days,
      ep.wo_source,
      CASE
        WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
        WHEN d::date IN (SELECT d FROM hols) THEN false
        ELSE true
      END AS is_working
    FROM emp_pat ep
    CROSS JOIN generate_series(v_month_start::timestamp, v_month_end::timestamp, interval '1 day') d
  ),
  wd AS (
    SELECT emp_id, off_days, wo_source,
           COUNT(*) FILTER (WHERE is_working)::numeric AS wdays
    FROM cal GROUP BY emp_id, off_days, wo_source
  ),
  -- Attendance rollup: present, half-day (0.5), incomplete-unresolved (0 LOP).
  -- A regularization is "approved" iff any request for that employee+date has status='approved'.
  att AS (
    SELECT
      a.employee_id AS emp_id,
      -- present day count: full-day present or explicit total_hours > 0 (excluding half_day)
      SUM(
        CASE
          WHEN LOWER(COALESCE(a.status,'')) = 'present' THEN 1
          WHEN LOWER(COALESCE(a.status,'')) = 'half_day' THEN 0.5
          WHEN COALESCE(a.total_hours,0) > 0
               AND LOWER(COALESCE(a.status,'')) NOT IN ('incomplete','absent','on_leave','weekly_off','holiday') THEN 1
          ELSE 0
        END
      )::numeric AS present_d,
      SUM(
        CASE
          WHEN LOWER(COALESCE(a.status,'')) = 'incomplete'
               AND NOT EXISTS (
                 SELECT 1 FROM public.hr_attendance_regularization_requests r
                 WHERE r.employee_id = a.employee_id
                   AND r.attendance_date = a.attendance_date
                   AND LOWER(r.status) = 'approved'
               )
          THEN 1
          ELSE 0
        END
      )::numeric AS incomplete_d
    FROM public.hr_attendance_daily a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY a.employee_id
  ),
  -- Approved leaves overlapping the month, split paid vs unpaid on working days.
  lv AS (
    SELECT
      lr.employee_id AS emp_id,
      lt.is_paid,
      lt.name AS lt_name,
      lr.leave_type_id,
      lr.start_date,
      lr.end_date,
      lr.is_half_day
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ANY(p_employee_ids)
      AND LOWER(lr.status) = 'approved'
      AND lr.start_date <= v_month_end
      AND lr.end_date   >= v_month_start
  ),
  lv_days AS (
    SELECT
      lv.emp_id,
      lv.is_paid,
      SUM(CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END)::numeric AS days
    FROM lv
    JOIN LATERAL generate_series(GREATEST(lv.start_date, v_month_start)::timestamp,
                                 LEAST(lv.end_date, v_month_end)::timestamp,
                                 interval '1 day') d ON true
    JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL
    GROUP BY lv.emp_id, lv.is_paid
  ),
  lv_cfg AS (
    SELECT emp_id,
           ARRAY_AGG(DISTINCT format('Leave type "%s" has no paid/unpaid setting — fix it in Leave Types before payroll.', COALESCE(lt_name, leave_type_id::text))) AS errs
    FROM lv WHERE is_paid IS NULL
    GROUP BY emp_id
  ),
  paid AS (
    SELECT emp_id, SUM(days) AS d FROM lv_days WHERE is_paid = true GROUP BY emp_id
  ),
  unpaid AS (
    SELECT emp_id, SUM(days) AS d FROM lv_days WHERE is_paid = false GROUP BY emp_id
  )
  SELECT
    ep.emp_id AS employee_id,
    COALESCE(wd.wdays, 0)::numeric AS working_days,
    COALESCE(att.present_d, 0)::numeric AS present_days,
    COALESCE(paid.d, 0)::numeric AS paid_leave_days,
    COALESCE(unpaid.d, 0)::numeric AS unpaid_leave_days,
    COALESCE(att.incomplete_d, 0)::numeric AS incomplete_unresolved_days,
    -- LOP = WD − (present + paid_leave + incomplete_unresolved). Unpaid leave and
    -- unexplained absence naturally fall into the shortfall. Capped at [0, WD].
    GREATEST(
      0,
      LEAST(
        COALESCE(wd.wdays, 0),
        COALESCE(wd.wdays, 0)
          - COALESCE(att.present_d, 0)
          - COALESCE(paid.d, 0)
          - COALESCE(att.incomplete_d, 0)
      )
    )::numeric AS lop_days,
    format(
      'LOP = WD %s − (present %s + paid_leave %s + incomplete_held %s) = %s',
      COALESCE(wd.wdays, 0),
      COALESCE(att.present_d, 0),
      COALESCE(paid.d, 0),
      COALESCE(att.incomplete_d, 0),
      GREATEST(0, LEAST(COALESCE(wd.wdays, 0),
        COALESCE(wd.wdays, 0) - COALESCE(att.present_d, 0) - COALESCE(paid.d, 0) - COALESCE(att.incomplete_d, 0)))
    ) AS formula,
    ep.off_days::int[] AS weekly_off_days,
    ep.wo_source AS weekly_off_source,
    COALESCE(lv_cfg.errs, ARRAY[]::text[]) AS config_errors
  FROM emp_pat ep
  LEFT JOIN wd      ON wd.emp_id = ep.emp_id
  LEFT JOIN att     ON att.emp_id = ep.emp_id
  LEFT JOIN paid    ON paid.emp_id = ep.emp_id
  LEFT JOIN unpaid  ON unpaid.emp_id = ep.emp_id
  LEFT JOIN lv_cfg  ON lv_cfg.emp_id = ep.emp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compute_lop_days(uuid[], date) TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_compute_lop_days(uuid[], date) IS
'Single source of truth for LOP-day computation. Consumed by razorpay-payroll-proxy (attendance push) and compute-shadow-payroll. Rules: WD = calendar − weekly-off − holiday; present + paid-leave subtract from LOP; incomplete-punch days are held harmless (0 LOP) until an approved regularization exists; unpaid leave and unexplained absence contribute to LOP via the shortfall; NULL is_paid on any touched leave type surfaces as a config error instead of a silent default.';

-- =====================================================================
-- 2. Register-first statutory-enrollment derivation
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hr_derive_statutory_enrollment_from_history(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count int;
  v_reg_count int;
  v_api_count int;
  v_pf_bool boolean;
  v_esi_bool boolean;
  v_pt_bool boolean;
  v_basic numeric;
  v_hra numeric;
  v_sa numeric;
  v_lta numeric;
  v_regular_gross numeric;
  v_custom jsonb;
  v_source text;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE reg_source_filename IS NOT NULL),
    COUNT(*) FILTER (WHERE pf_amount IS NOT NULL OR esi_amount IS NOT NULL OR professional_tax IS NOT NULL)
  INTO v_row_count, v_reg_count, v_api_count
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('status','no_history');
  END IF;

  -- Register-first: if we have any register-imported row for this employee, use its
  -- explicit reg_* columns as authoritative. An ESI-enrolled employee who crossed
  -- the ₹21k ceiling for one month still has a truthful reg_esi_ee across the
  -- other months. Only when there is NO register history at all do we fall back
  -- to inferring from API-side pf_amount/esi_amount line presence.
  IF v_reg_count > 0 THEN
    SELECT
      BOOL_OR(COALESCE(reg_pf_ee,0)  > 0 OR COALESCE(reg_pf_er,0)  > 0 OR COALESCE(pf_amount,0)  > 0),
      BOOL_OR(COALESCE(reg_esi_ee,0) > 0 OR COALESCE(reg_esi_er,0) > 0 OR COALESCE(esi_amount,0) > 0),
      BOOL_OR(COALESCE(reg_pt,0)     > 0 OR COALESCE(professional_tax,0) > 0)
    INTO v_pf_bool, v_esi_bool, v_pt_bool
    FROM public.hr_razorpay_payslip_records
    WHERE hr_employee_id = p_employee_id
      AND reg_source_filename IS NOT NULL;
    v_source := 'register_verified';
  ELSE
    SELECT
      BOOL_OR(COALESCE(pf_amount,0)  > 0),
      BOOL_OR(COALESCE(esi_amount,0) > 0),
      BOOL_OR(COALESCE(professional_tax,0) > 0)
    INTO v_pf_bool, v_esi_bool, v_pt_bool
    FROM public.hr_razorpay_payslip_records
    WHERE hr_employee_id = p_employee_id;
    v_source := CASE WHEN v_api_count > 0 THEN 'payslip_verified' ELSE 'assumed_from_global' END;
  END IF;

  -- Structure split — prefer a full-attendance register row; fall back to any
  -- month with reg_basic>0; last resort: any month with basic_pay>0.
  SELECT reg_basic, reg_hra, reg_special_allowance, reg_lta
  INTO v_basic, v_hra, v_sa, v_lta
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id
    AND reg_basic > 0
    AND reg_working_days >= 28
  ORDER BY period_month DESC
  LIMIT 1;

  IF v_basic IS NULL THEN
    SELECT reg_basic, reg_hra, reg_special_allowance, reg_lta
    INTO v_basic, v_hra, v_sa, v_lta
    FROM public.hr_razorpay_payslip_records
    WHERE hr_employee_id = p_employee_id AND reg_basic > 0
    ORDER BY period_month DESC LIMIT 1;
  END IF;

  IF v_basic IS NOT NULL AND v_basic > 0 THEN
    v_regular_gross := v_basic + COALESCE(v_hra,0) + COALESCE(v_sa,0) + COALESCE(v_lta,0);
    IF v_regular_gross > 0 AND ABS((v_basic / v_regular_gross) - 0.50) > 0.015 THEN
      v_custom := jsonb_build_object(
        'basic',   ROUND((v_basic / v_regular_gross) * 100, 2),
        'hra',     ROUND((COALESCE(v_hra,0) / v_regular_gross) * 100, 2),
        'special', ROUND((COALESCE(v_sa,0)  / v_regular_gross) * 100, 2),
        'lta',     ROUND((COALESCE(v_lta,0) / v_regular_gross) * 100, 2),
        'source', 'derived_from_register',
        'derived_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
    END IF;
  END IF;

  UPDATE public.hr_employees
  SET pf_enabled  = v_pf_bool,
      esi_enabled = v_esi_bool,
      pt_enabled  = v_pt_bool,
      custom_structure_pct = COALESCE(v_custom, custom_structure_pct),
      statutory_flags_source = CASE
        WHEN v_source = 'register_verified' THEN 'register_derived'
        ELSE v_source
      END
  WHERE id = p_employee_id;

  RETURN jsonb_build_object(
    'status','derived',
    'months_seen', v_row_count,
    'register_months', v_reg_count,
    'pf_enabled', v_pf_bool,
    'esi_enabled', v_esi_bool,
    'pt_enabled', v_pt_bool,
    'source', v_source,
    'custom_structure_pct', v_custom
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_derive_statutory_enrollment_from_history(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_derive_statutory_enrollment_from_history(uuid) IS
'Register-first statutory-enrollment inference. Prefers the explicit reg_pf_ee/reg_esi_ee/reg_pt columns from imported Salary Register CSVs over payslip-line presence, so an ESI-enrolled employee who crossed the ₹21k ceiling for one month is not falsely flagged not_enrolled. Falls back to API pf_amount/esi_amount only when no register history exists.';
